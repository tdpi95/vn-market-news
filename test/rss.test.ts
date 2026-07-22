import { describe, expect, it } from 'vitest';
import { parseRss } from '../src/lib/rss.js';

const SAMPLE_RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Sample feed</title>
    <item>
      <title><![CDATA[HPG: Thông báo giao dịch cổ phiếu]]></title>
      <link>https://example.com/hpg-thong-bao</link>
      <guid isPermaLink="true">https://example.com/hpg-thong-bao</guid>
      <pubDate>Wed, 22 Jul 2026 08:00:00 +0700</pubDate>
      <description><![CDATA[<p>Nội dung chi tiết</p>]]></description>
      <category>chung-khoan</category>
    </item>
    <item>
      <title>Second item without CDATA</title>
      <link>https://example.com/second</link>
      <pubDate>Wed, 22 Jul 26 02:00:00 +0700</pubDate>
    </item>
  </channel>
</rss>`;

describe('parseRss', () => {
  it('parses items with CDATA titles/descriptions and category tags', () => {
    const items = parseRss('cafef', SAMPLE_RSS);
    expect(items).toHaveLength(2);
    expect(items[0].title).toBe('HPG: Thông báo giao dịch cổ phiếu');
    expect(items[0].link).toBe('https://example.com/hpg-thong-bao');
    expect(items[0].description).toContain('Nội dung chi tiết');
    expect(items[0].category).toEqual(['chung-khoan']);
  });

  it('parses items missing optional fields', () => {
    const items = parseRss('cafef', SAMPLE_RSS);
    expect(items[1].title).toBe('Second item without CDATA');
    expect(items[1].category).toEqual([]);
  });

  it('throws SourceParseError on non-RSS XML', () => {
    expect(() => parseRss('cafef', '<html></html>')).toThrow();
  });
});
