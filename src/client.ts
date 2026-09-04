import { dedupeNewsItems, sortByPublishedAtDesc } from './lib/dedupe.js';
import { createCafebizSource } from './sources/cafebiz.js';
import { CafefSource } from './sources/cafef.js';
import { createDddnSource } from './sources/dddn.js';
import { GoogleNewsSource } from './sources/google-news.js';
import { HoseSource } from './sources/hose.js';
import { FmarketFundSource } from './sources/fmarket-fund.js';
import type { GetFundDetailOptions, SearchFundsOptions } from './sources/fmarket-fund.js';
import { KbsFinanceSource } from './sources/kbs-finance.js';
import type { GetFinancialStatementsOptions } from './sources/kbs-finance.js';
import { VciFinanceSource } from './sources/vci-finance.js';
import { KbsCompanySource } from './sources/kbs-company.js';
import type { GetCompanyInfoOptions } from './sources/kbs-company.js';
import { VciCompanySource } from './sources/vci-company.js';
import { KbsListingSource } from './sources/kbs-listing.js';
import type { ListSymbolsOptions } from './sources/kbs-listing.js';
import { createVnEconomySource } from './sources/vneconomy.js';
import { createVnExpressSource } from './sources/vnexpress.js';
import { VietstockSource } from './sources/vietstock.js';
import { createZnewsSource } from './sources/znews.js';
import { NewsQueryTypeSchema } from './types.js';
import type {
  CompanyNewsQuery,
  MarketNewsQuery,
  NewsFeedResult,
  NewsItem,
  NewsSource,
  SearchNewsQuery,
  SourceError,
  SourceName,
} from './types.js';
import type { FinancialStatementResult } from './finance-types.js';
import type { FundDetailResult, FundSummary } from './fund-types.js';
import type { CompanyInfoResult, CompanySymbolListingEntry } from './company-types.js';
import type { z } from 'zod';

export function defaultSources(): NewsSource[] {
  return [
    new HoseSource(),
    new VietstockSource(),
    new CafefSource(),
    new GoogleNewsSource(),
    createVnExpressSource(),
    createCafebizSource(),
    createVnEconomySource(),
    createDddnSource(),
    createZnewsSource(),
  ];
}

export interface VnMarketNewsOptions {
  /** Full replacement for the default source list, e.g. `[...defaultSources(), myCustomSource]`. */
  sources?: NewsSource[];
  /** Excludes specific default sources without having to rebuild the list manually. */
  disabledSources?: SourceName[];
}

type QueryType = z.infer<typeof NewsQueryTypeSchema>;

/**
 * Sources queried by `getCompanyNews` when the caller doesn't pass an
 * explicit `sources` list. Narrower than the full default source list:
 * cafef/vnexpress/cafebiz/vneconomy/dddn/znews have no per-ticker feed or
 * search endpoint, so their `fetchCompanyNews` just fetches every market
 * channel and regex-filters titles for the ticker — slow (full-channel
 * fetches) and usually empty (a ticker rarely appears verbatim in a
 * category feed's recent items). hose/vietstock/google-news all resolve
 * the ticker into a real per-company query instead. Pass `sources`
 * explicitly to override this and include one of the low-yield sources
 * anyway.
 */
const COMPANY_NEWS_SOURCES: SourceName[] = ['hose', 'vietstock', 'google-news'];

/**
 * Aggregates Vietnam market news/disclosures across sources into one
 * normalized, deduplicated feed. Per-source failures never fail the whole
 * call — they're collected in `sourceErrors` instead, so a broken or
 * rate-limited source degrades the result rather than throwing.
 */
export class VnMarketNews {
  private readonly sources: NewsSource[];
  private readonly financeSources = { kbs: new KbsFinanceSource(), vci: new VciFinanceSource() };
  private readonly companySources = { kbs: new KbsCompanySource(), vci: new VciCompanySource() };
  private readonly listingSource = new KbsListingSource();
  private readonly fundSource = new FmarketFundSource();

  constructor(opts: VnMarketNewsOptions = {}) {
    let sources = opts.sources ?? defaultSources();
    if (opts.disabledSources?.length) {
      const disabled = new Set(opts.disabledSources);
      sources = sources.filter((s) => !disabled.has(s.name));
    }
    this.sources = sources;
  }

  /**
   * Structured financial statements/ratios for a ticker (balance sheet,
   * income statement, cash flow, or ratios). Two sources are available —
   * pass `source` to pick the one that fits:
   * - `'kbs'` (default, see `KbsFinanceSource`): human-readable line-item
   *   names directly from the API, ~4 periods per call, figures in
   *   thousands VND.
   * - `'vci'` (see `VciFinanceSource`): full history (8+ years, 30+
   *   quarters), raw VND figures, but statement line items need a second
   *   endpoint join for names and include a fixed cross-industry field set
   *   (all-zero/absent items are dropped rather than shown as noise).
   *
   * Unlike the news methods above, this hits a single source and throws on
   * failure rather than degrading into `sourceErrors`, since there's no
   * fallback source.
   */
  async getFinancialStatements(
    ticker: string,
    opts: GetFinancialStatementsOptions & { source?: 'kbs' | 'vci' } = {},
  ): Promise<FinancialStatementResult> {
    const { source = 'kbs', ...rest } = opts;
    return this.financeSources[source].getFinancialStatements(ticker, rest);
  }

  /**
   * Company profile, officers, shareholders, ownership breakdown, and
   * subsidiaries for a ticker. Two sources are available with different
   * strengths — pass `source` to pick the one that fits:
   * - `'kbs'` (default, see `KbsCompanySource`): richer registration info
   *   (address/tax id/auditor/etc.), charter capital history, and labor
   *   structure, but no sector/industry classification.
   * - `'vci'` (see `VciCompanySource`): has `sector`/`sectorVn`/ICB codes
   *   on `profile`, but no charter capital history, no labor structure,
   *   and thinner officer records (no tenure/`fromDate`).
   *
   * Like `getFinancialStatements`, this hits a single source and throws on
   * failure rather than degrading into `sourceErrors`.
   */
  async getCompanyInfo(
    ticker: string,
    opts: GetCompanyInfoOptions & { source?: 'kbs' | 'vci' } = {},
  ): Promise<CompanyInfoResult> {
    const { source = 'kbs', ...rest } = opts;
    return this.companySources[source].getCompanyInfo(ticker, rest);
  }

  /**
   * Market-wide ticker → company name listing, sourced from KB Securities
   * — see `KbsListingSource`. Separate from `getCompanyInfo` because the
   * profile endpoint that powers it has no name field, and this listing
   * endpoint has no per-ticker filtering (always fetches the whole
   * market), so the two are deliberately not fused into one call.
   */
  async listSymbols(opts: ListSymbolsOptions = {}): Promise<CompanySymbolListingEntry[]> {
    return this.listingSource.listSymbols(opts);
  }

  /**
   * Search/list open-end mutual funds by short name or name substring
   * (pass '' to list all), sourced from Fmarket — see `FmarketFundSource`.
   * Throws on failure rather than degrading into `sourceErrors`.
   */
  async searchFunds(query = '', opts: SearchFundsOptions = {}): Promise<FundSummary[]> {
    return this.fundSource.searchFunds(query, opts);
  }

  /**
   * NAV, top holdings, and industry/asset allocation for one fund, by its
   * short name (e.g. "VESAF"). Set `includeNavHistory` for full NAV history
   * since inception (a separate, heavier call).
   */
  async getFundDetail(symbol: string, opts: GetFundDetailOptions = {}): Promise<FundDetailResult> {
    return this.fundSource.getFundDetail(symbol, opts);
  }

  async getMarketNews(query: MarketNewsQuery = {}): Promise<NewsFeedResult> {
    const selected = this.selectSources(query.sources);
    const { items, errors } = await this.runAll(selected, (s) => s.fetchMarketNews(query));
    return this.buildResult('market', {}, items, errors, query.limit);
  }

  /**
   * By default only queries `hose`/`vietstock`/`google-news` — see
   * `COMPANY_NEWS_SOURCES` for why. Pass `sources` explicitly to widen
   * (or narrow) that set.
   */
  async getCompanyNews(query: CompanyNewsQuery): Promise<NewsFeedResult> {
    const selected = this.selectSources(query.sources ?? COMPANY_NEWS_SOURCES);
    const { items, errors } = await this.runAll(selected, (s) => s.fetchCompanyNews(query.ticker, query));
    return this.buildResult('company', { ticker: query.ticker.toUpperCase() }, items, errors, query.limit);
  }

  async search(query: SearchNewsQuery): Promise<NewsFeedResult> {
    const selected = this.selectSources(query.sources).filter((s) => typeof s.search === 'function');
    const { items, errors } = await this.runAll(selected, (s) => s.search!(query.keyword, query));
    return this.buildResult('search', { keyword: query.keyword }, items, errors, query.limit);
  }

  private selectSources(names?: SourceName[]): NewsSource[] {
    if (!names?.length) return this.sources;
    const set = new Set(names);
    return this.sources.filter((s) => set.has(s.name));
  }

  private async runAll(
    sources: NewsSource[],
    fn: (s: NewsSource) => Promise<NewsItem[]>,
  ): Promise<{ items: NewsItem[]; errors: SourceError[] }> {
    const settled = await Promise.allSettled(sources.map((s) => fn(s)));
    const items: NewsItem[] = [];
    const errors: SourceError[] = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        items.push(...result.value);
      } else {
        const reason = result.reason;
        errors.push({
          source: sources[i].name,
          message: reason instanceof Error ? reason.message : String(reason),
        });
      }
    });
    return { items, errors };
  }

  private buildResult(
    type: QueryType,
    extra: { ticker?: string; keyword?: string },
    items: NewsItem[],
    errors: SourceError[],
    limit?: number,
  ): NewsFeedResult {
    const deduped = sortByPublishedAtDesc(dedupeNewsItems(items));
    return {
      generatedAt: new Date().toISOString(),
      query: { type, ...extra },
      items: limit ? deduped.slice(0, limit) : deduped,
      sourceErrors: errors,
    };
  }
}
