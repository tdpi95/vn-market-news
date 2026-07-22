import { afterEach, describe, expect, it, vi } from 'vitest';
import { KbsCompanySource } from '../src/sources/kbs-company.js';

const PROFILE_RESPONSE = {
  SM: '<p>- Sản xuất thép xây dựng.</p>',
  SB: 'HPG',
  FD: '',
  CC: 76755,
  HM: 7896,
  LD: '15/11/2007',
  FV: 10000,
  EX: 'HOSE',
  LP: 127000,
  CTP: 'Ông Nguyễn Việt Thắng',
  CTPP: 'Tổng Giám đốc',
  KT: 'KPMG',
  TY: 'Công ty cổ phần',
  ADD: 'KCN Phố Nối A',
  URL: 'https://www.hoaphat.com.vn/',
  HS: '<p>Năm 1992: Thành lập.</p>',
  KLCPNY: 76754658550000,
  SFV: 10000,
  KLCPLH: 8442964520,
  AD: '2025-12-31T00:00:00',
  Subsidiaries: [{ D: '2025-12-31T00:00:00', NM: 'CTCP Gang thép Hòa Phát', CC: 74000000000000, OR: 99.99, CR: 'VND' }],
  Leaders: [{ FD: '1992', PN: 'CTHĐQT', NM: 'Ông Trần Đình Long', PO: 'Chairman of BOD' }],
  Ownership: [{ NM: 'CBCNV công ty', OR: 11, SH: 844301244.05, D: '2025-12-31T00:00:00' }],
  Shareholders: [{ NM: 'Trần Đình Long', D: '2025-06-30T00:00:00', V: 1980000000, OR: 25.8 }],
  CharterCapital: [{ D: '11/08/2025', V: 76754658550000, C: 'VND' }],
  LaborStructure: [{ Name: 'Công nhân KT', NameEn: 'Technical Worker', Value: 7896, Rate: 25.007917907138786 }],
};

describe('KbsCompanySource', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('maps the profile response into a structured CompanyInfoResult', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify(PROFILE_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch;

    const source = new KbsCompanySource();
    const result = await source.getCompanyInfo('hpg');

    expect(result.ticker).toBe('HPG');
    expect(result.source).toBe('kbs');

    // Full-precision KLCPNY wins over the rounded CC*1e9 fallback.
    expect(result.profile.charterCapital).toBe(76754658550000);
    expect(result.profile.outstandingShares).toBe(8442964520);
    expect(result.profile.businessModel).toBe('- Sản xuất thép xây dựng.');
    expect(result.profile.foundedDate).toBeUndefined();
    expect(result.profile.listingDate).toBe('2007-11-14T17:00:00.000Z');
    expect(result.profile.asOfDate).toBe('2025-12-30T17:00:00.000Z');

    expect(result.officers).toEqual([
      { name: 'Ông Trần Đình Long', position: 'CTHĐQT', positionEn: 'Chairman of BOD', fromDate: '1992' },
    ]);
    expect(result.shareholders[0]).toMatchObject({ name: 'Trần Đình Long', sharesOwned: 1980000000, ownershipPercent: 25.8 });
    expect(result.shareholders[0].updatedAt).toBe('2025-06-29T17:00:00.000Z');
    expect(result.ownership[0]).toMatchObject({ ownerType: 'CBCNV công ty', ownershipPercent: 11 });
    expect(result.subsidiaries[0]).toMatchObject({ name: 'CTCP Gang thép Hòa Phát', ownershipPercent: 99.99 });
    expect(result.capitalHistory[0]).toEqual({ date: '2025-08-10T17:00:00.000Z', charterCapital: 76754658550000, currency: 'VND' });
    expect(result.laborStructure[0]).toMatchObject({ name: 'Công nhân KT', nameEn: 'Technical Worker', value: 7896 });
  });

  it('falls back to CC * 1e9 when KLCPNY is absent', async () => {
    const { KLCPNY, ...withoutPreciseCapital } = PROFILE_RESPONSE;
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify(withoutPreciseCapital), { status: 200 }),
    ) as unknown as typeof fetch;

    const source = new KbsCompanySource();
    const result = await source.getCompanyInfo('HPG');

    expect(result.profile.charterCapital).toBe(76755 * 1e9);
  });

  it('throws SourceParseError when the response shape is unexpected', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({}), { status: 200 })) as unknown as typeof fetch;

    const source = new KbsCompanySource();
    await expect(source.getCompanyInfo('HPG')).rejects.toThrow(/profile fields/);
  });
});
