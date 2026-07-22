import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VietstockSource } from '../src/sources/vietstock.js';

const SEARCH_RESPONSE = {
  totalCount: 1,
  success: true,
  data: [
    {
      ArticleID: 12345,
      Title: 'HPG: Hòa Phát báo lãi quý 2 tăng mạnh',
      Head: 'Tập đoàn Hòa Phát công bố kết quả kinh doanh quý 2/2026.',
      PublishTime: '2026-07-22T01:00:00Z',
      Tag: 'HPG,Hoa Phat,chung khoan',
      URL: '/2026/07/hoa-phat-758-1467951.htm',
      Source: 'Vietstock',
    },
  ],
};

const RSS_RESPONSE = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title>VN-Index vượt mốc mới</title>
    <link>https://vietstock.vn/2026/07/vn-index-758-1.htm</link>
    <guid>https://vietstock.vn/2026/07/vn-index-758-1.htm</guid>
    <pubDate>Wed, 22 Jul 2026 08:00:00 +0700</pubDate>
    <description>Thị trường chứng khoán phiên hôm nay</description>
  </item>
</channel></rss>`;

describe('VietstockSource', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url.includes('dc.vietstock.vn')) {
        return new Response(JSON.stringify(SEARCH_RESPONSE), { status: 200 });
      }
      if (url.includes('.rss')) {
        return new Response(RSS_RESPONSE, { status: 200 });
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('maps company search results into normalized NewsItems', async () => {
    const source = new VietstockSource();
    const items = await source.fetchCompanyNews('HPG');
    expect(items).toHaveLength(1);
    expect(items[0].source).toBe('vietstock');
    expect(items[0].sourceType).toBe('news_article');
    expect(items[0].tickers).toContain('HPG');
    expect(items[0].url).toBe('https://vietstock.vn/2026/07/hoa-phat-758-1467951.htm');
    expect(items[0].originalSource).toBe('Vietstock');
  });

  it('aggregates configured RSS channels for market news', async () => {
    const source = new VietstockSource();
    const items = await source.fetchMarketNews();
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toBe('VN-Index vượt mốc mới');
    expect(items[0].sourceType).toBe('news_article');
  });
});
