import { afterEach, describe, expect, it, vi } from 'vitest';
import { KbsListingSource } from '../src/sources/kbs-listing.js';

const SEARCH_RESPONSE = [
  { symbol: 'HPG', name: 'CTCP Tập đoàn Hòa Phát', nameEn: 'Hoa Phat Group Joint Stock Company', exchange: 'HOSE', type: 'stock' },
  { symbol: 'HSG', name: 'CTCP Tập đoàn Hoa Sen', nameEn: 'Hoa Sen Group', exchange: 'HOSE', type: 'stock' },
  { symbol: 'FUCTVGF3', name: 'Quỹ Đầu tư Tăng trưởng Thiên Việt 3', nameEn: 'Thien Viet Growth Fund 3', exchange: 'HOSE', type: 'fund' },
  { symbol: 'CHPG2616', name: null, nameEn: 'CW HPG/MSVN/7M/0126', exchange: 'HOSE', type: 'cw' },
  { symbol: 'HDB125011', exchange: 'HNX', type: 'bond' },
];

describe('KbsListingSource', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('defaults to stock rows only', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify(SEARCH_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch;

    const source = new KbsListingSource();
    const rows = await source.listSymbols();

    expect(rows).toEqual([
      { symbol: 'HPG', name: 'CTCP Tập đoàn Hòa Phát', nameEn: 'Hoa Phat Group Joint Stock Company', exchange: 'HOSE', type: 'stock' },
      { symbol: 'HSG', name: 'CTCP Tập đoàn Hoa Sen', nameEn: 'Hoa Sen Group', exchange: 'HOSE', type: 'stock' },
    ]);
  });

  it('filters by a case-insensitive substring match against symbol, name, or nameEn', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify(SEARCH_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch;

    const source = new KbsListingSource();

    await expect(source.listSymbols({ query: 'hoa phat' })).resolves.toEqual([
      { symbol: 'HPG', name: 'CTCP Tập đoàn Hòa Phát', nameEn: 'Hoa Phat Group Joint Stock Company', exchange: 'HOSE', type: 'stock' },
    ]);
    await expect(source.listSymbols({ query: 'hsg' })).resolves.toEqual([
      { symbol: 'HSG', name: 'CTCP Tập đoàn Hoa Sen', nameEn: 'Hoa Sen Group', exchange: 'HOSE', type: 'stock' },
    ]);
  });

  it('applies limit after type/query filtering', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify(SEARCH_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch;

    const source = new KbsListingSource();
    const rows = await source.listSymbols({ limit: 1 });

    expect(rows).toHaveLength(1);
    expect(rows[0].symbol).toBe('HPG');
  });

  it('filters by the requested type and treats null names as absent', async () => {
    global.fetch = vi.fn(
      async () => new Response(JSON.stringify(SEARCH_RESPONSE), { status: 200 }),
    ) as unknown as typeof fetch;

    const source = new KbsListingSource();
    const rows = await source.listSymbols({ type: 'cw' });

    expect(rows).toEqual([
      { symbol: 'CHPG2616', name: undefined, nameEn: 'CW HPG/MSVN/7M/0126', exchange: 'HOSE', type: 'cw' },
    ]);
  });
});
