import { httpGetJson, httpPostJson } from '../lib/http.js';
import { SourceParseError } from '../errors.js';
import type {
  FundAssetType,
  FundDetailResult,
  FundHolding,
  FundNavPoint,
  FundSummary,
} from '../fund-types.js';

const SOURCE = 'fmarket-fund';

/**
 * Open-end mutual fund data (NAV, holdings, industry/asset allocation) from
 * Fmarket, Vietnam's main open-end fund distribution platform.
 *
 * Confirmed live (2026-07): the endpoint requires no auth beyond a plain
 * browser User-Agent. This is the same API vnstock's open-source
 * `vnstock.explorer.fmarket` module uses — unlike KB Securities/Vietstock/
 * CafeF elsewhere in this library, it's a genuinely public data feed (not
 * gated behind a paid tier), though still undocumented/could change shape
 * without notice.
 *
 * Quirks handled here:
 * - There's no direct "get fund by short name" endpoint — resolving a
 *   symbol to Fmarket's internal numeric id requires a `searchFunds` call
 *   first, then a detail call by id (mirrors what the fund's own site does).
 * - Bond and stock holdings come back as two separate lists in the detail
 *   response; both are normalized into one `topHoldings` array here, tagged
 *   by `assetType`.
 * - NAV history is a separate, heavier call (full history since inception,
 *   not just recent points) — only fetched when `includeNavHistory` is set.
 */
const BASE_URL = 'https://api.fmarket.vn/res/products';
const NAV_HISTORY_URL = 'https://api.fmarket.vn/res/product/get-nav-history';

const ASSET_TYPE_CODE: Record<FundAssetType, string> = {
  stock: 'STOCK',
  bond: 'BOND',
  balanced: 'BALANCED',
};

const ASSET_TYPE_FROM_CODE: Record<string, FundAssetType> = {
  STOCK: 'stock',
  BOND: 'bond',
  BALANCED: 'balanced',
};

interface FmarketApiResponse<T> {
  data?: T;
}

interface FmarketNavChangeRow {
  navToPrevious?: number | null;
  navToLastYear?: number | null;
  navToBeginning?: number | null;
  navTo1Months?: number | null;
  navTo3Months?: number | null;
  navTo6Months?: number | null;
  navTo12Months?: number | null;
  navTo36Months?: number | null;
}

interface FmarketFundRow {
  id: number;
  shortName: string;
  name: string;
  nav: number;
  managementFee?: number | null;
  firstIssueAt?: number | null;
  updateAt?: number | null;
  owner?: { name?: string; shortName?: string } | null;
  dataFundAssetType?: { code?: string } | null;
  productNavChange?: FmarketNavChangeRow | null;
}

interface FmarketHoldingRow {
  stockCode?: string;
  industry?: string;
  netAssetPercent?: number;
  updateAt?: number;
}

interface FmarketIndustryHoldingRow {
  industry: string;
  assetPercent: number;
}

interface FmarketAssetHoldingRow {
  assetType?: { name?: string };
  assetPercent: number;
}

interface FmarketFundDetailRow extends FmarketFundRow {
  productTopHoldingList?: FmarketHoldingRow[];
  productTopHoldingBondList?: FmarketHoldingRow[];
  productIndustriesHoldingList?: FmarketIndustryHoldingRow[];
  productAssetHoldingList?: FmarketAssetHoldingRow[];
}

interface FmarketNavHistoryRow {
  navDate: string;
  nav: number;
}

function toFundSummary(row: FmarketFundRow): FundSummary {
  const nc = row.productNavChange ?? {};
  return {
    id: row.id,
    shortName: row.shortName,
    name: row.name,
    assetType: row.dataFundAssetType?.code ? ASSET_TYPE_FROM_CODE[row.dataFundAssetType.code] : undefined,
    managerName: row.owner?.shortName || row.owner?.name || undefined,
    managementFee: row.managementFee ?? undefined,
    nav: row.nav,
    inceptionDate: row.firstIssueAt ? new Date(row.firstIssueAt).toISOString() : undefined,
    navChangePercent: {
      previous: nc.navToPrevious ?? undefined,
      ytd: nc.navToLastYear ?? undefined,
      m1: nc.navTo1Months ?? undefined,
      m3: nc.navTo3Months ?? undefined,
      m6: nc.navTo6Months ?? undefined,
      m12: nc.navTo12Months ?? undefined,
      m36: nc.navTo36Months ?? undefined,
      sinceInception: nc.navToBeginning ?? undefined,
    },
    updatedAt: row.updateAt ? new Date(row.updateAt).toISOString() : undefined,
  };
}

function toFundHolding(row: FmarketHoldingRow, assetType: 'stock' | 'bond'): FundHolding {
  return {
    assetType,
    code: row.stockCode,
    industry: row.industry,
    netAssetPercent: row.netAssetPercent ?? 0,
    updatedAt: row.updateAt ? new Date(row.updateAt).toISOString() : undefined,
  };
}

export interface SearchFundsOptions {
  assetType?: FundAssetType;
  /** @default 100 */
  limit?: number;
  signal?: AbortSignal;
}

export interface GetFundDetailOptions {
  /** Also fetch full NAV history since inception (a separate, heavier API call). @default false */
  includeNavHistory?: boolean;
  signal?: AbortSignal;
}

export class FmarketFundSource {
  /** Search/list funds by short name or name substring; pass '' to list all. */
  async searchFunds(query = '', opts: SearchFundsOptions = {}): Promise<FundSummary[]> {
    const payload = {
      searchField: query,
      types: ['NEW_FUND', 'TRADING_FUND'],
      pageSize: opts.limit ?? 100,
      fundAssetTypes: opts.assetType ? [ASSET_TYPE_CODE[opts.assetType]] : [],
    };

    const json = await httpPostJson<FmarketApiResponse<{ rows: FmarketFundRow[] }>>(
      SOURCE,
      `${BASE_URL}/filter`,
      payload,
      { signal: opts.signal },
    );

    const rows = json.data?.rows;
    if (!rows) {
      throw new SourceParseError(SOURCE, 'response missing data.rows — the API shape likely changed');
    }
    return rows.map(toFundSummary);
  }

  async getFundDetail(symbol: string, opts: GetFundDetailOptions = {}): Promise<FundDetailResult> {
    const shortName = symbol.toUpperCase();
    const matches = await this.searchFunds(shortName, { signal: opts.signal });
    const fund = matches.find((f) => f.shortName === shortName) ?? matches[0];
    if (!fund) {
      throw new SourceParseError(SOURCE, `no fund found for symbol "${symbol}"`);
    }

    const detail = await httpGetJson<FmarketApiResponse<FmarketFundDetailRow>>(
      SOURCE,
      `${BASE_URL}/${fund.id}`,
      { signal: opts.signal },
    );
    const data = detail.data;
    if (!data) {
      throw new SourceParseError(SOURCE, 'response missing data — the API shape likely changed');
    }

    const topHoldings = [
      ...(data.productTopHoldingList ?? []).map((r) => toFundHolding(r, 'stock')),
      ...(data.productTopHoldingBondList ?? []).map((r) => toFundHolding(r, 'bond')),
    ];

    const navHistory = opts.includeNavHistory ? await this.getNavHistory(fund.id, opts.signal) : undefined;

    return {
      fund: toFundSummary(data),
      topHoldings,
      industryAllocation: (data.productIndustriesHoldingList ?? []).map((r) => ({
        industry: r.industry,
        assetPercent: r.assetPercent,
      })),
      assetAllocation: (data.productAssetHoldingList ?? []).map((r) => ({
        assetType: r.assetType?.name ?? 'unknown',
        assetPercent: r.assetPercent,
      })),
      navHistory,
      fetchedAt: new Date().toISOString(),
      source: 'fmarket',
    };
  }

  private async getNavHistory(fundId: number, signal?: AbortSignal): Promise<FundNavPoint[]> {
    const toDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const json = await httpPostJson<FmarketApiResponse<FmarketNavHistoryRow[]>>(
      SOURCE,
      NAV_HISTORY_URL,
      { isAllData: 1, productId: fundId, fromDate: null, toDate },
      { signal },
    );
    return (json.data ?? []).map((p) => ({ date: p.navDate, nav: p.nav }));
  }
}
