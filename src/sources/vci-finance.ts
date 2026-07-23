import { httpGetJson } from '../lib/http.js';
import { naiveVnTimestampToIso } from '../lib/vn-date.js';
import { SourceParseError } from '../errors.js';
import type {
  FinancialLineItem,
  FinancialPeriod,
  FinancialPeriodType,
  FinancialStatementResult,
  FinancialStatementType,
} from '../finance-types.js';

const SOURCE = 'vci-finance';

/**
 * Financial statements (balance sheet, income statement, cash flow) and
 * financial ratios for HOSE/HNX/UPCOM-listed companies, sourced from VCI
 * (Vietcap)'s public "iq-insight-service" backend — the same API vnstock's
 * `vnstock.explorer.vci.Finance` class uses. Confirmed live (2026-07), no
 * auth needed beyond the same `Origin`/`Referer` headers `VciCompanySource`
 * uses.
 *
 * Trade-offs vs `KbsFinanceSource`, worth knowing before picking a source:
 * - Balance sheet/income statement/cash flow rows use cryptic field codes
 *   (`bsa1`, `isa1`, `cfa1`, ...) rather than KBS's human-readable names, so
 *   this fetches a second `financial-statement/metrics` endpoint to map
 *   field → English/Vietnamese name + hierarchy `level`, and joins the two.
 * - That metrics endpoint returns one fixed ~120-field schema shared by
 *   every industry (banks, insurers, non-financials alike), so most
 *   companies report `0`/absent for whole swaths of it (e.g. bank-only
 *   fields for a steelmaker). Line items where every returned period is
 *   `0`/null are dropped — otherwise every result would carry ~90 dead rows.
 * - No consolidated/standalone distinction is exposed on statement rows
 *   (unlike KBS's `United` field) — every response observed so far reads as
 *   consolidated group figures, so `consolidated: true` is hardcoded.
 * - Statement figures are already raw VND (`unitScale: 1`), not thousands
 *   like KBS.
 * - Ratios come from a single `statistics-financial` endpoint that mixes
 *   quarterly trailing-twelve-month rows (`ratioType: 'RATIO_TTM'`, one per
 *   quarter) and annual rows (`ratioType: 'RATIO_YEAR'`, `quarter: 5`) in
 *   one flat list — filtered here by `periodType` rather than returning both.
 * - Both the statement and ratio endpoints return oldest-period-first;
 *   reversed here to match KBS's most-recent-first convention.
 */
const BASE_URL = 'https://iq.vietcap.com.vn/api/iq-insight-service/v1/company';
const VCI_HEADERS = {
  origin: 'https://trading.vietcap.com.vn',
  referer: 'https://trading.vietcap.com.vn/',
};

type StatementSection = 'balance_sheet' | 'income_statement' | 'cash_flow';

const STATEMENT_SECTION: Record<StatementSection, string> = {
  balance_sheet: 'BALANCE_SHEET',
  income_statement: 'INCOME_STATEMENT',
  cash_flow: 'CASH_FLOW',
};

/**
 * Trimmed from vnstock's `RATIO_COLUMN_MAP_EN`/`RATIO_COLUMN_MAP_VI`. Unlike
 * the statement field codes above, VCI's ratio endpoint already returns
 * readable camelCase field names — this is display-name enrichment (and a
 * source of a `%` unit hint), not a required decoder ring.
 */
const RATIO_NAMES: Record<string, { en: string; vi: string }> = {
  numberOfSharesMktCap: { en: 'Outstanding Shares (mil)', vi: 'Số CP lưu hành (triệu)' },
  marketCap: { en: 'Market Cap', vi: 'Vốn hóa' },
  dividendYield: { en: 'Dividend Yield (%)', vi: 'Tỷ suất cổ tức (%)' },
  pe: { en: 'P/E', vi: 'P/E' },
  pb: { en: 'P/B', vi: 'P/B' },
  ps: { en: 'P/S', vi: 'P/S' },
  priceToCashFlow: { en: 'Price/Cash Flow', vi: 'Giá/Dòng tiền' },
  evToEbitda: { en: 'EV/EBITDA', vi: 'EV/EBITDA' },
  cashRatio: { en: 'Cash Ratio', vi: 'Hệ số thanh toán tiền' },
  quickRatio: { en: 'Quick Ratio', vi: 'Hệ số thanh toán nhanh' },
  currentRatio: { en: 'Current Ratio', vi: 'Hệ số thanh toán hiện hành' },
  ownersEquity: { en: 'Owners Equity', vi: 'Vốn chủ sở hữu' },
  debtPerEquity: { en: 'Debt/Equity', vi: 'Nợ/Vốn chủ' },
  debtToEquity: { en: 'Debt to Equity', vi: 'Nợ trên vốn chủ' },
  roe: { en: 'ROE (%)', vi: 'ROE (%)' },
  roa: { en: 'ROA (%)', vi: 'ROA (%)' },
  daySaleOutstanding: { en: 'Days Sales Outstanding', vi: 'Số ngày phải thu' },
  daysInventoryOutstanding: { en: 'Days Inventory Outstanding', vi: 'Số ngày tồn kho' },
  daysPayableOutstanding: { en: 'Days Payable Outstanding', vi: 'Số ngày phải trả' },
  grossMargin: { en: 'Gross Margin (%)', vi: 'Biên LN gộp (%)' },
  ebitMargin: { en: 'EBIT Margin (%)', vi: 'Biên EBIT (%)' },
  preTaxProfitMargin: { en: 'Pre-tax Profit Margin (%)', vi: 'Biên LN trước thuế (%)' },
  afterTaxProfitMargin: { en: 'After-tax Profit Margin (%)', vi: 'Biên LN sau thuế (%)' },
  assetTurnover: { en: 'Asset Turnover', vi: 'Vòng quay tài sản' },
  netInterestMargin: { en: 'Net Interest Margin', vi: 'Biên lãi thuần' },
  averageYieldOnEarningAssets: { en: 'Avg Yield on Earning Assets', vi: 'Lãi suất bình quân tài sản sinh lãi' },
  averageCostOfFinancing: { en: 'Avg Cost of Financing', vi: 'Chi phí vốn bình quân' },
  nonAndInterestIncome: { en: 'Non-interest Income', vi: 'Thu nhập ngoài lãi' },
  costToIncome: { en: 'Cost/Income Ratio', vi: 'Tỷ lệ CIR' },
  loansGrowth: { en: 'Loans Growth (%)', vi: 'Tăng trưởng cho vay (%)' },
  depositGrowth: { en: 'Deposit Growth (%)', vi: 'Tăng trưởng tiền gửi (%)' },
  equityToLiabilities: { en: 'Equity/Total Liabilities', vi: 'Vốn chủ/Tổng nợ' },
  equityToLoans: { en: 'Equity/Loans', vi: 'Vốn chủ/Cho vay' },
  totalEquityTotalAsset: { en: 'Equity/Total Assets', vi: 'Vốn chủ/Tổng tài sản' },
  ldrLoanDepositRatio: { en: 'LDR (%)', vi: 'LDR (%)' },
  npl: { en: 'NPL (%)', vi: 'Nợ xấu (%)' },
  loansLossReservesToNPLs: { en: 'Loan Loss Reserves/NPLs', vi: 'DP rủi ro/Nợ xấu' },
  loansLossReserveToLoans: { en: 'Loan Loss Reserve/Loans', vi: 'DP rủi ro/Cho vay' },
  provisionToOutstandingLoans: { en: 'Provision/Outstanding Loans', vi: 'Trích lập DP/Cho vay' },
  ebit: { en: 'EBIT', vi: 'EBIT' },
  ebitda: { en: 'EBITDA', vi: 'EBITDA' },
  roic: { en: 'ROIC', vi: 'ROIC' },
  cashCycle: { en: 'Cash Cycle', vi: 'Chu kỳ tiền' },
  fixedAssetTurnover: { en: 'Fixed Asset Turnover', vi: 'Vòng quay TS cố định' },
  financialLeverage: { en: 'Financial Leverage', vi: 'Đòn bẩy tài chính' },
  cir: { en: 'CIR', vi: 'CIR' },
  car: { en: 'CAR', vi: 'CAR' },
  equity: { en: 'Equity', vi: 'Vốn chủ sở hữu' },
  casaRatio: { en: 'CASA Ratio', vi: 'Tỷ lệ CASA' },
};

interface VciEnvelope<T> {
  data: T | null;
}

interface VciMetricField {
  level: number;
  field: string;
  titleEn: string;
  titleVi: string;
}

type VciMetricsResponse = Record<string, VciMetricField[]>;

interface VciStatementRow {
  yearReport: number;
  /** 1-4 = quarter, 5 = full-year sentinel. */
  lengthReport: number;
  publicDate?: string;
  [field: string]: unknown;
}

interface VciStatementSections {
  years: VciStatementRow[];
  quarters: VciStatementRow[];
}

interface VciRatioRow {
  yearReport: number;
  quarter: number;
  ratioType: 'RATIO_TTM' | 'RATIO_YEAR';
  [field: string]: unknown;
}

function statementPeriodLabel(row: VciStatementRow): string {
  return row.lengthReport === 5 ? String(row.yearReport) : `${row.yearReport}-Q${row.lengthReport}`;
}

function toStatementPeriod(row: VciStatementRow): FinancialPeriod {
  return {
    label: statementPeriodLabel(row),
    year: row.yearReport,
    quarter: row.lengthReport === 5 ? undefined : row.lengthReport,
    reportDate: row.publicDate ? naiveVnTimestampToIso(row.publicDate) : undefined,
    consolidated: true,
  };
}

function toStatementItems(rows: VciStatementRow[], periods: FinancialPeriod[], fields: VciMetricField[]): FinancialLineItem[] {
  return fields
    .map((field) => {
      const values: Record<string, number | null> = {};
      rows.forEach((row, i) => {
        const raw = row[field.field];
        values[periods[i].label] = typeof raw === 'number' ? raw : null;
      });
      return {
        name: field.titleEn || field.titleVi,
        nameVi: field.titleVi,
        level: field.level,
        values,
      };
    })
    .filter((item) => Object.values(item.values).some((v) => v != null && v !== 0));
}

function ratioPeriodLabel(row: VciRatioRow, periodType: FinancialPeriodType): string {
  return periodType === 'quarter' ? `${row.yearReport}-Q${row.quarter}` : String(row.yearReport);
}

function toRatioPeriod(row: VciRatioRow, periodType: FinancialPeriodType): FinancialPeriod {
  return {
    label: ratioPeriodLabel(row, periodType),
    year: row.yearReport,
    quarter: periodType === 'quarter' ? row.quarter : undefined,
    consolidated: true,
  };
}

function toRatioItems(rows: VciRatioRow[], periods: FinancialPeriod[]): FinancialLineItem[] {
  const fieldNames = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (RATIO_NAMES[key]) fieldNames.add(key);
    }
  }
  return [...fieldNames]
    .map((field) => {
      const meta = RATIO_NAMES[field];
      const values: Record<string, number | null> = {};
      rows.forEach((row, i) => {
        const raw = row[field];
        values[periods[i].label] = typeof raw === 'number' ? raw : null;
      });
      return {
        name: meta.en,
        nameVi: meta.vi,
        unit: meta.en.endsWith('(%)') ? '%' : undefined,
        level: 0,
        values,
      };
    })
    .filter((item) => Object.values(item.values).some((v) => v != null));
}

export interface GetFinancialStatementsOptions {
  /** @default 'balance_sheet' */
  statementType?: FinancialStatementType;
  /** @default 'year' */
  period?: FinancialPeriodType;
  signal?: AbortSignal;
}

export class VciFinanceSource {
  async getFinancialStatements(
    ticker: string,
    opts: GetFinancialStatementsOptions = {},
  ): Promise<FinancialStatementResult> {
    const statementType = opts.statementType ?? 'balance_sheet';
    const periodType = opts.period ?? 'year';
    const symbol = ticker.toUpperCase();

    if (statementType === 'ratios') {
      const envelope = await httpGetJson<VciEnvelope<VciRatioRow[]>>(
        SOURCE,
        `${BASE_URL}/${symbol}/statistics-financial`,
        { headers: VCI_HEADERS, signal: opts.signal },
      );
      const wantedType = periodType === 'quarter' ? 'RATIO_TTM' : 'RATIO_YEAR';
      const rows = (envelope.data ?? []).filter((row) => row.ratioType === wantedType).reverse();
      if (!rows.length) {
        throw new SourceParseError(SOURCE, `no ratio data for "${symbol}" — the API shape likely changed`);
      }

      const periods = rows.map((row) => toRatioPeriod(row, periodType));
      return {
        ticker: symbol,
        statementType,
        periodType,
        currency: 'VND',
        periods,
        items: toRatioItems(rows, periods),
        fetchedAt: new Date().toISOString(),
        source: 'vci',
        raw: rows,
      };
    }

    const section = STATEMENT_SECTION[statementType];
    const [statementEnvelope, metricsEnvelope] = await Promise.all([
      httpGetJson<VciEnvelope<VciStatementSections>>(SOURCE, `${BASE_URL}/${symbol}/financial-statement?section=${section}`, {
        headers: VCI_HEADERS,
        signal: opts.signal,
      }),
      httpGetJson<VciEnvelope<VciMetricsResponse>>(SOURCE, `${BASE_URL}/${symbol}/financial-statement/metrics`, {
        headers: VCI_HEADERS,
        signal: opts.signal,
      }),
    ]);

    if (!statementEnvelope.data) {
      throw new SourceParseError(SOURCE, `no ${statementType} data for "${symbol}" — the API shape likely changed`);
    }
    if (!metricsEnvelope.data?.[section]) {
      throw new SourceParseError(SOURCE, 'response missing field-name metadata — the API shape likely changed');
    }

    const rows = (periodType === 'quarter' ? statementEnvelope.data.quarters : statementEnvelope.data.years).slice().reverse();
    const fields = metricsEnvelope.data[section];
    const periods = rows.map(toStatementPeriod);

    return {
      ticker: symbol,
      statementType,
      periodType,
      currency: 'VND',
      unitScale: 1,
      periods,
      items: toStatementItems(rows, periods, fields),
      fetchedAt: new Date().toISOString(),
      source: 'vci',
      raw: { statement: statementEnvelope.data, fields },
    };
  }
}
