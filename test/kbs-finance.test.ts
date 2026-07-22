import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { KbsFinanceSource } from '../src/sources/kbs-finance.js';

const BALANCE_SHEET_RESPONSE = {
  Head: [
    { YearPeriod: 2025, TermCode: 'N', ReportDate: '2026-03-24T00:00:00', United: 'HN', AuditedStatus: 'KT' },
    { YearPeriod: 2024, TermCode: 'N', ReportDate: '2025-03-24T00:00:00', United: 'HN', AuditedStatus: 'KT' },
  ],
  Content: {
    'Báo cáo tình hình tài chính': [
      {
        Name: 'TÀI SẢN',
        NameEn: 'ASSETS',
        Unit: null,
        UnitEn: null,
        Levels: 0,
        ReportComponentName: 'Báo cáo tình hình tài chính',
        ReportComponentNameEn: 'Statement of Financial Position',
        Value1: null,
        Value2: null,
      },
      {
        Name: 'A. TÀI SẢN NGẮN HẠN',
        NameEn: 'A. SHORT-TERM ASSETS',
        Unit: null,
        UnitEn: null,
        Levels: 1,
        ReportComponentName: 'Báo cáo tình hình tài chính',
        ReportComponentNameEn: 'Statement of Financial Position',
        Value1: 103659402760,
        Value2: 86674276273,
      },
    ],
  },
};

const QUARTERLY_DUPLICATE_HEAD_RESPONSE = {
  Head: [
    { YearPeriod: 2026, TermCode: 'Q1', United: 'HN', AuditedStatus: 'CKT' },
    { YearPeriod: 2025, TermCode: 'Q4', United: 'HN', AuditedStatus: 'CKT' },
    { YearPeriod: 2025, TermCode: 'Q4', United: 'HN', AuditedStatus: 'CKT' },
  ],
  Content: {
    'Kết quả kinh doanh': [
      {
        Name: 'Doanh thu',
        NameEn: 'Revenue',
        Levels: 0,
        Value1: 10,
        Value2: 20,
        Value3: 20,
      },
    ],
  },
};

describe('KbsFinanceSource', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('maps balance sheet rows into labeled, period-keyed line items', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify(BALANCE_SHEET_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch;

    const source = new KbsFinanceSource();
    const result = await source.getFinancialStatements('HPG', { statementType: 'balance_sheet', period: 'year' });

    expect(result.ticker).toBe('HPG');
    expect(result.statementType).toBe('balance_sheet');
    expect(result.periodType).toBe('year');
    expect(result.currency).toBe('VND');
    expect(result.unitScale).toBe(1000);
    expect(result.periods).toEqual([
      { label: '2025', year: 2025, quarter: undefined, reportDate: '2026-03-23T17:00:00.000Z', consolidated: true, auditStatus: 'audited' },
      { label: '2024', year: 2024, quarter: undefined, reportDate: '2025-03-23T17:00:00.000Z', consolidated: true, auditStatus: 'audited' },
    ]);

    const shortTermAssets = result.items.find((i) => i.name === 'A. SHORT-TERM ASSETS');
    expect(shortTermAssets?.nameVi).toBe('A. TÀI SẢN NGẮN HẠN');
    expect(shortTermAssets?.level).toBe(1);
    expect(shortTermAssets?.values).toEqual({ '2025': 103659402760, '2024': 86674276273 });
  });

  it('dedupes repeated period entries and labels quarters correctly', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify(QUARTERLY_DUPLICATE_HEAD_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch;

    const source = new KbsFinanceSource();
    const result = await source.getFinancialStatements('HPG', { statementType: 'income_statement', period: 'quarter' });

    expect(result.periods.map((p) => p.label)).toEqual(['2026-Q1', '2025-Q4']);
    expect(result.periods[0].quarter).toBe(1);

    const revenue = result.items.find((i) => i.name === 'Revenue');
    // Value2 and Value3 both correspond to the duplicated 2025-Q4 head entry
    // and are identical, so the values map should just have one 2025-Q4 key.
    expect(revenue?.values).toEqual({ '2026-Q1': 10, '2025-Q4': 20 });
  });

  it('throws SourceParseError when the response shape is unexpected', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;

    const source = new KbsFinanceSource();
    await expect(source.getFinancialStatements('HPG')).rejects.toThrow(/Head\/Content/);
  });
});
