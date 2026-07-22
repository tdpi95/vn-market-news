import { afterEach, describe, expect, it, vi } from 'vitest';
import { FmarketFundSource } from '../src/sources/fmarket-fund.js';

const SEARCH_RESPONSE = {
  data: {
    total: 1,
    rows: [
      {
        id: 23,
        shortName: 'VESAF',
        name: 'QUỸ ĐẦU TƯ CỔ PHIẾU TĂNG TRƯỞNG CHIẾN LƯỢC VINACAPITAL',
        nav: 30368.25,
        managementFee: 1.75,
        firstIssueAt: 1492448400000,
        updateAt: 1784694125146,
        owner: { name: 'CÔNG TY CỔ PHẦN QUẢN LÝ QUỸ VINACAPITAL', shortName: 'VINACAPITAL' },
        dataFundAssetType: { code: 'STOCK' },
        productNavChange: {
          navToPrevious: -2.83,
          navToLastYear: -9.54,
          navToBeginning: 203.68,
          navTo12Months: -7.65,
        },
      },
    ],
  },
};

const DETAIL_RESPONSE = {
  data: {
    id: 23,
    shortName: 'VESAF',
    name: 'QUỸ ĐẦU TƯ CỔ PHIẾU TĂNG TRƯỞNG CHIẾN LƯỢC VINACAPITAL',
    nav: 30368.25,
    managementFee: 1.75,
    firstIssueAt: 1492448400000,
    updateAt: 1784694125146,
    owner: { shortName: 'VINACAPITAL' },
    dataFundAssetType: { code: 'STOCK' },
    productNavChange: { navToPrevious: -2.83 },
    productTopHoldingList: [
      { stockCode: 'BVH', industry: 'Bảo hiểm', netAssetPercent: 7.32, updateAt: 1783674008413 },
    ],
    productTopHoldingBondList: [],
    productIndustriesHoldingList: [{ industry: 'Ngân hàng', assetPercent: 21.8 }],
    productAssetHoldingList: [{ assetType: { name: 'Cổ phiếu' }, assetPercent: 88.62 }],
  },
};

const NAV_HISTORY_RESPONSE = {
  data: [
    { navDate: '2017-04-25', nav: 10000 },
    { navDate: '2017-04-29', nav: 10058 },
  ],
};

describe('FmarketFundSource', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('maps fund search results into FundSummary', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify(SEARCH_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch;

    const source = new FmarketFundSource();
    const funds = await source.searchFunds('VESAF');

    expect(funds).toEqual([
      {
        id: 23,
        shortName: 'VESAF',
        name: 'QUỸ ĐẦU TƯ CỔ PHIẾU TĂNG TRƯỞNG CHIẾN LƯỢC VINACAPITAL',
        assetType: 'stock',
        managerName: 'VINACAPITAL',
        managementFee: 1.75,
        nav: 30368.25,
        inceptionDate: new Date(1492448400000).toISOString(),
        navChangePercent: {
          previous: -2.83,
          ytd: -9.54,
          m1: undefined,
          m3: undefined,
          m6: undefined,
          m12: -7.65,
          m36: undefined,
          sinceInception: 203.68,
        },
        updatedAt: new Date(1784694125146).toISOString(),
      },
    ]);
  });

  it('resolves a fund by symbol and merges holdings/allocation into FundDetailResult', async () => {
    global.fetch = vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url);
      if (href.includes('/filter')) return new Response(JSON.stringify(SEARCH_RESPONSE), { status: 200 });
      if (href.includes('get-nav-history')) return new Response(JSON.stringify(NAV_HISTORY_RESPONSE), { status: 200 });
      return new Response(JSON.stringify(DETAIL_RESPONSE), { status: 200 });
    }) as unknown as typeof fetch;

    const source = new FmarketFundSource();
    const result = await source.getFundDetail('vesaf', { includeNavHistory: true });

    expect(result.fund.shortName).toBe('VESAF');
    expect(result.source).toBe('fmarket');
    expect(result.topHoldings).toEqual([
      { assetType: 'stock', code: 'BVH', industry: 'Bảo hiểm', netAssetPercent: 7.32, updatedAt: new Date(1783674008413).toISOString() },
    ]);
    expect(result.industryAllocation).toEqual([{ industry: 'Ngân hàng', assetPercent: 21.8 }]);
    expect(result.assetAllocation).toEqual([{ assetType: 'Cổ phiếu', assetPercent: 88.62 }]);
    expect(result.navHistory).toEqual([
      { date: '2017-04-25', nav: 10000 },
      { date: '2017-04-29', nav: 10058 },
    ]);
  });

  it('throws SourceParseError when no fund matches the symbol', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify({ data: { total: 0, rows: [] } }), { status: 200 }),
    ) as unknown as typeof fetch;

    const source = new FmarketFundSource();
    await expect(source.getFundDetail('NOSUCHFUND')).rejects.toThrow(/no fund found/);
  });
});
