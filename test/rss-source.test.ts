import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRssNewsSource } from '../src/lib/rss-source.js';

const SAMPLE_RSS = `<?xml version="1.0"?>
<rss version="2.0"><channel>
  <item>
    <title><![CDATA[HPG: Hòa Phát báo lãi quý 2 tăng mạnh]]></title>
    <link>https://example.com/hpg-lai-quy-2</link>
    <guid>https://example.com/hpg-lai-quy-2</guid>
    <pubDate>Wed, 22 Jul 2026 08:00:00 +0700</pubDate>
    <description>Tập đoàn Hòa Phát công bố kết quả kinh doanh.</description>
  </item>
  <item>
    <title>VN-Index vượt mốc mới</title>
    <link>https://example.com/vn-index</link>
    <guid>https://example.com/vn-index</guid>
    <pubDate>Wed, 22 Jul 2026 09:00:00 +0700</pubDate>
    <description>Thị trường chứng khoán phiên hôm nay</description>
  </item>
</channel></rss>`;

describe('createRssNewsSource', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('aggregates configured channels into normalized NewsItems tagged with the given source name', async () => {
    global.fetch = vi.fn(async () => new Response(SAMPLE_RSS, { status: 200 })) as unknown as typeof fetch;

    const source = createRssNewsSource('vnexpress', [{ url: 'https://example.com/feed.rss', category: 'kinh-doanh' }]);
    const items = await source.fetchMarketNews();

    expect(items).toHaveLength(2);
    expect(items[0].source).toBe('vnexpress');
    expect(items[0].sourceType).toBe('news_article');
    expect(items[0].category).toBe('kinh-doanh');
    expect(items[0].tickers).toContain('HPG');
    expect(items[0].tickerConfidence).toBe('heuristic');
  });

  it('filters and tags company news by matching the ticker in the title', async () => {
    global.fetch = vi.fn(async () => new Response(SAMPLE_RSS, { status: 200 })) as unknown as typeof fetch;

    const source = createRssNewsSource('vnexpress', [{ url: 'https://example.com/feed.rss', category: 'kinh-doanh' }]);
    const items = await source.fetchCompanyNews('HPG');

    expect(items).toHaveLength(1);
    expect(items[0].title).toContain('Hòa Phát');
    expect(items[0].tickers).toContain('HPG');
  });

  it('merges multiple channels and applies the limit across them', async () => {
    global.fetch = vi.fn(async () => new Response(SAMPLE_RSS, { status: 200 })) as unknown as typeof fetch;

    const source = createRssNewsSource('cafebiz', [
      { url: 'https://example.com/a.rss', category: 'a' },
      { url: 'https://example.com/b.rss', category: 'b' },
    ]);
    const items = await source.fetchMarketNews({ limit: 3 });

    expect(items).toHaveLength(3);
  });
});
