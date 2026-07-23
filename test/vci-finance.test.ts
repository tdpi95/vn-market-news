import { afterEach, describe, expect, it, vi } from 'vitest';
import { VciFinanceSource } from '../src/sources/vci-finance.js';

const BALANCE_SHEET_STATEMENT = {
  data: {
    years: [
      { organCode: 'HPG', yearReport: 2024, lengthReport: 5, publicDate: '2025-03-23T00:00:00', bsa1: 100, bsa2: 0 },
      { organCode: 'HPG', yearReport: 2025, lengthReport: 5, publicDate: '2026-03-23T00:00:00', bsa1: 120, bsa2: 0 },
    ],
    quarters: [],
  },
};

const BALANCE_SHEET_METRICS = {
  data: {
    BALANCE_SHEET: [
      { level: 1, parent: null, field: 'bsa1', titleEn: 'CURRENT ASSETS', titleVi: 'TÀI SẢN NGẮN HẠN' },
      { level: 2, parent: 'BSA1', field: 'bsa2', titleEn: 'Bank-only field', titleVi: 'Trường chỉ dành cho ngân hàng' },
    ],
  },
};

const RATIO_RESPONSE = {
  data: [
    { yearReport: 2024, quarter: 1, ratioType: 'RATIO_TTM', pe: 10, roe: 0.2 },
    { yearReport: 2024, quarter: 5, ratioType: 'RATIO_YEAR', pe: 11, roe: 0.25 },
    { yearReport: 2025, quarter: 1, ratioType: 'RATIO_TTM', pe: 12, roe: 0.22 },
    { yearReport: 2025, quarter: 5, ratioType: 'RATIO_YEAR', pe: 13, roe: 0.27 },
  ],
};

function routeFetch(url: string) {
  const body = url.includes('/financial-statement/metrics')
    ? BALANCE_SHEET_METRICS
    : url.includes('/financial-statement?section=')
      ? BALANCE_SHEET_STATEMENT
      : url.includes('/statistics-financial')
        ? RATIO_RESPONSE
        : null;
  if (!body) throw new Error(`unexpected URL in test: ${url}`);
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('VciFinanceSource', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('joins statement rows with the field-name metadata, reversed to most-recent-first', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => routeFetch(String(input))) as unknown as typeof fetch;

    const source = new VciFinanceSource();
    const result = await source.getFinancialStatements('HPG', { statementType: 'balance_sheet', period: 'year' });

    expect(result.ticker).toBe('HPG');
    expect(result.source).toBe('vci');
    expect(result.currency).toBe('VND');
    expect(result.unitScale).toBe(1);
    expect(result.periods).toEqual([
      { label: '2025', year: 2025, quarter: undefined, reportDate: '2026-03-22T17:00:00.000Z', consolidated: true },
      { label: '2024', year: 2024, quarter: undefined, reportDate: '2025-03-22T17:00:00.000Z', consolidated: true },
    ]);

    // bsa2 is 0 in every period ("bank-only field" for a non-bank ticker) — dropped as noise.
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ name: 'CURRENT ASSETS', nameVi: 'TÀI SẢN NGẮN HẠN', level: 1 });
    expect(result.items[0].values).toEqual({ '2025': 120, '2024': 100 });
  });

  it('filters ratio rows by periodType and reverses to most-recent-first', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => routeFetch(String(input))) as unknown as typeof fetch;

    const source = new VciFinanceSource();
    const result = await source.getFinancialStatements('HPG', { statementType: 'ratios', period: 'year' });

    expect(result.periods.map((p) => p.label)).toEqual(['2025', '2024']);
    const pe = result.items.find((i) => i.name === 'P/E');
    expect(pe?.values).toEqual({ '2025': 13, '2024': 11 });
    const roe = result.items.find((i) => i.name === 'ROE (%)');
    expect(roe?.unit).toBe('%');
    expect(roe?.values).toEqual({ '2025': 0.27, '2024': 0.25 });
  });

  it('throws SourceParseError when the ticker has no statement data', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/financial-statement?section=')) return new Response(JSON.stringify({ data: null }), { status: 200 });
      return routeFetch(url);
    }) as unknown as typeof fetch;

    const source = new VciFinanceSource();
    await expect(source.getFinancialStatements('ZZZZZ', { statementType: 'balance_sheet' })).rejects.toThrow(/no balance_sheet data/);
  });
});
