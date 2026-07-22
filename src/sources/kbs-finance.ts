import { httpGetJson } from '../lib/http.js';
import { naiveVnTimestampToIso } from '../lib/kbs-date.js';
import { SourceParseError } from '../errors.js';
import type {
  FinancialLineItem,
  FinancialPeriod,
  FinancialPeriodType,
  FinancialStatementResult,
  FinancialStatementType,
} from '../finance-types.js';

const SOURCE = 'kbs-finance';

/**
 * Financial statements (balance sheet, income statement, cash flow) and
 * financial ratios for HOSE/HNX-listed companies, sourced from KB Securities
 * Vietnam's "KB Buddy" web-trading backend.
 *
 * Confirmed live (2026-07): the endpoint requires no auth beyond a plain
 * browser User-Agent, and — unlike Vietcap's equivalent, which returns
 * cryptic field codes (`bsa1`, `bsa2`, ...) — every line item ships with
 * both Vietnamese and English human-readable names, making it usable
 * directly without maintaining a separate field-code dictionary.
 *
 * This is an undocumented internal API for KBS's own app, not a published
 * public API — same "could change without notice" risk as Vietstock/CafeF
 * elsewhere in this library. Known quirks handled here:
 * - The API occasionally repeats one period verbatim in its period list
 *   (seen for quarterly data); duplicates are removed by (year, term,
 *   consolidated) identity.
 * - `page`/`pageSize` params exist but don't appear to control how many
 *   periods come back in practice (always ~4) — not exposed as an option
 *   here since it wouldn't do anything.
 * - Every response observed so far returns consolidated (HN) figures only;
 *   there's no confirmed way to request standalone/parent-only figures.
 */
const BASE_URL = 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/stock/finance-info';

const STATEMENT_TYPE_CODE: Record<FinancialStatementType, string> = {
  balance_sheet: 'CDKT',
  income_statement: 'KQKD',
  cash_flow: 'LCTT',
  ratios: 'CSTC',
};

const AUDIT_STATUS_MAP: Record<string, 'audited' | 'reviewed' | 'unaudited'> = {
  KT: 'audited',
  SX: 'reviewed',
  CKT: 'unaudited',
};

interface KbsHeadEntry {
  YearPeriod: number;
  /** 'N' for a full year, 'Q1'..'Q4' for a quarter. */
  TermCode: string;
  ReportDate?: string;
  /** 'HN' = consolidated, 'ĐL'/'CTM' = standalone/parent. */
  United?: string;
  AuditedStatus?: string;
}

interface KbsContentRow {
  Name: string;
  NameEn?: string;
  Unit?: string | null;
  UnitEn?: string | null;
  Levels?: number;
  ReportComponentName?: string;
  ReportComponentNameEn?: string;
  Value1?: number | null;
  Value2?: number | null;
  Value3?: number | null;
  Value4?: number | null;
}

interface KbsResponse {
  Head?: KbsHeadEntry[];
  Content?: Record<string, KbsContentRow[]>;
}

function periodLabel(head: KbsHeadEntry): string {
  return head.TermCode === 'N' ? String(head.YearPeriod) : `${head.YearPeriod}-${head.TermCode}`;
}

function toFinancialPeriod(head: KbsHeadEntry): FinancialPeriod {
  const quarter = head.TermCode.startsWith('Q') ? Number(head.TermCode.slice(1)) : undefined;
  return {
    label: periodLabel(head),
    year: head.YearPeriod,
    quarter,
    reportDate: head.ReportDate ? naiveVnTimestampToIso(head.ReportDate) : undefined,
    consolidated: head.United === 'HN',
    auditStatus: head.AuditedStatus ? AUDIT_STATUS_MAP[head.AuditedStatus] : undefined,
  };
}

function dedupePeriods(heads: KbsHeadEntry[]): FinancialPeriod[] {
  const seen = new Set<string>();
  const result: FinancialPeriod[] = [];
  for (const head of heads) {
    const key = `${head.YearPeriod}|${head.TermCode}|${head.United}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(toFinancialPeriod(head));
  }
  return result;
}

function rowToLineItem(row: KbsContentRow, heads: KbsHeadEntry[]): FinancialLineItem {
  const rawValues = [row.Value1, row.Value2, row.Value3, row.Value4];
  const values: Record<string, number | null> = {};
  heads.forEach((head, i) => {
    // Duplicate period entries (see class doc comment) share the same label
    // and, so far, identical values, so overwriting on collision is safe.
    values[periodLabel(head)] = rawValues[i] ?? null;
  });
  return {
    name: row.NameEn?.trim() || row.Name.trim(),
    nameVi: row.Name?.trim(),
    unit: row.UnitEn?.trim() || row.Unit?.trim() || undefined,
    level: row.Levels ?? 0,
    section: row.ReportComponentNameEn,
    sectionVi: row.ReportComponentName,
    values,
  };
}

export interface GetFinancialStatementsOptions {
  /** @default 'balance_sheet' */
  statementType?: FinancialStatementType;
  /** @default 'year' */
  period?: FinancialPeriodType;
  signal?: AbortSignal;
}

export class KbsFinanceSource {
  async getFinancialStatements(
    ticker: string,
    opts: GetFinancialStatementsOptions = {},
  ): Promise<FinancialStatementResult> {
    const statementType = opts.statementType ?? 'balance_sheet';
    const periodType = opts.period ?? 'year';
    const typeCode = STATEMENT_TYPE_CODE[statementType];
    const termType = periodType === 'quarter' ? '2' : '1';
    const symbol = ticker.toUpperCase();

    // The cash-flow report type is the one KBS variant observed to need the
    // extra `code`/camelCase `termType` params; sending them unconditionally
    // for every statement type has been confirmed harmless.
    const params = new URLSearchParams({
      page: '1',
      pageSize: '20',
      type: typeCode,
      unit: '1000',
      termtype: termType,
      termType,
      code: symbol,
      languageid: '1',
    });

    const json = await httpGetJson<KbsResponse>(SOURCE, `${BASE_URL}/${symbol}?${params.toString()}`, {
      signal: opts.signal,
    });

    if (!json.Head || !json.Content) {
      throw new SourceParseError(SOURCE, 'response missing Head/Content — the API shape likely changed');
    }

    const heads = json.Head;
    const items = Object.values(json.Content)
      .flat()
      .map((row) => rowToLineItem(row, heads));

    return {
      ticker: symbol,
      statementType,
      periodType,
      currency: 'VND',
      unitScale: statementType === 'ratios' ? undefined : 1000,
      periods: dedupePeriods(heads),
      items,
      fetchedAt: new Date().toISOString(),
      source: 'kbs',
      raw: json,
    };
  }
}
