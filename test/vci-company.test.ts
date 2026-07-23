import { afterEach, describe, expect, it, vi } from 'vitest';
import { VciCompanySource } from '../src/sources/vci-company.js';

const DETAILS_RESPONSE = {
  data: {
    comTypeCode: 'CT',
    sector: 'Basic Resources',
    sectorVn: 'Tài nguyên Cơ bản',
    icbCodeLv2: '1700',
    icbCodeLv4: '1757',
    profile: '<div><p>Công ty Cổ phần Tập đoàn Hòa Phát.</p></div>',
    numberOfSharesMktCap: 8442964520,
    listingDate: '2007-11-15T00:00:00',
  },
};

const SHAREHOLDER_STRUCTURE_RESPONSE = {
  data: {
    stateVolume: 0,
    statePercentage: 0,
    foreignerVolume: 1800782439,
    foreignPercentage: 0.21328793,
    otherVolume: 6642182081,
    otherPercentage: 0.78671207,
    bodPercentage: 0.3108263087,
    institutionPercentage: 0.0321035095,
  },
};

const SHAREHOLDER_LIST_RESPONSE = {
  data: [
    {
      ownerName: 'Trần Đình Long',
      positionName: 'Chủ tịch Hội đồng Quản trị',
      positionNameEn: 'Chairman of Management Board',
      quantity: 1980000000,
      percentage: 0.25796,
      ownerType: 'INDIVIDUAL',
      updateDate: '2026-03-10T16:56:34.897',
    },
    {
      ownerName: 'Vũ Thị Hiền',
      positionName: null,
      positionNameEn: null,
      quantity: 528000000,
      percentage: 0.06879,
      ownerType: 'INDIVIDUAL',
      updateDate: '2026-03-10T16:57:09.09',
    },
  ],
};

const RELATIONSHIP_RESPONSE = {
  data: {
    affiliates: [],
    subsidiaries: [
      { rightOrganNameVi: 'Công ty TNHH Tôn Hòa Phát', rightOrganNameEn: 'Hoa Phat Steel Sheet LLC', ownedPercentage: 1 },
    ],
  },
};

function routeFetch(url: string) {
  const body = url.includes('/details?ticker=')
    ? DETAILS_RESPONSE
    : url.endsWith('/shareholder-structure')
      ? SHAREHOLDER_STRUCTURE_RESPONSE
      : url.endsWith('/shareholder')
        ? SHAREHOLDER_LIST_RESPONSE
        : url.endsWith('/relationship')
          ? RELATIONSHIP_RESPONSE
          : null;
  if (!body) throw new Error(`unexpected URL in test: ${url}`);
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('VciCompanySource', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('fans out 4 requests and merges them into a structured CompanyInfoResult', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => routeFetch(String(input))) as unknown as typeof fetch;

    const source = new VciCompanySource();
    const result = await source.getCompanyInfo('hpg');

    expect(result.ticker).toBe('HPG');
    expect(result.source).toBe('vci');

    expect(result.profile.sector).toBe('Basic Resources');
    expect(result.profile.sectorVn).toBe('Tài nguyên Cơ bản');
    expect(result.profile.icbCodeLv2).toBe('1700');
    expect(result.profile.businessModel).toBe('Công ty Cổ phần Tập đoàn Hòa Phát.');
    expect(result.profile.outstandingShares).toBe(8442964520);
    expect(result.profile.listingDate).toBe('2007-11-14T17:00:00.000Z');

    expect(result.officers).toEqual([
      { name: 'Trần Đình Long', position: 'Chủ tịch Hội đồng Quản trị', positionEn: 'Chairman of Management Board' },
    ]);

    expect(result.shareholders).toHaveLength(2);
    expect(result.shareholders[0].name).toBe('Trần Đình Long');
    expect(result.shareholders[0].sharesOwned).toBe(1980000000);
    expect(result.shareholders[0].ownershipPercent).toBeCloseTo(25.796);

    expect(result.ownership.map((g) => g.ownerType)).toEqual(['State', 'Foreign', 'Other', 'Board of Directors', 'Institution']);
    expect(result.ownership[0].ownershipPercent).toBeCloseTo(0);
    expect(result.ownership[1].sharesOwned).toBe(1800782439);
    expect(result.ownership[1].ownershipPercent).toBeCloseTo(21.328793);
    expect(result.ownership[2].ownershipPercent).toBeCloseTo(78.671207);
    expect(result.ownership[3].ownershipPercent).toBeCloseTo(31.08263087);
    expect(result.ownership[4].ownershipPercent).toBeCloseTo(3.21035095);

    expect(result.subsidiaries).toEqual([{ name: 'Công ty TNHH Tôn Hòa Phát', ownershipPercent: 100 }]);
    expect(result.capitalHistory).toEqual([]);
    expect(result.laborStructure).toEqual([]);
  });

  it('throws SourceParseError when the ticker has no company details', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/details?ticker=')) return new Response(JSON.stringify({ data: null }), { status: 200 });
      return routeFetch(url);
    }) as unknown as typeof fetch;

    const source = new VciCompanySource();
    await expect(source.getCompanyInfo('ZZZZZ')).rejects.toThrow(/no company found/);
  });
});
