import { describe, expect, it } from 'vitest';
import { VnMarketNews } from '../src/client.js';
import type { NewsItem, NewsSource, SourceName } from '../src/types.js';

function stubSource(name: SourceName): NewsSource {
  return {
    name,
    async fetchMarketNews(): Promise<NewsItem[]> {
      return [];
    },
    async fetchCompanyNews(ticker: string): Promise<NewsItem[]> {
      return [
        {
          id: `${name}-${ticker}`,
          source: name,
          sourceType: 'news_article',
          title: `${name} news about ${ticker}`,
          url: `https://example.com/${name}`,
          publishedAt: new Date().toISOString(),
          fetchedAt: new Date().toISOString(),
          tickers: [ticker],
          language: 'vi',
        },
      ];
    },
  };
}

const ALL_SOURCE_NAMES: SourceName[] = [
  'hose',
  'vietstock',
  'cafef',
  'google-news',
  'vnexpress',
  'cafebiz',
  'vneconomy',
  'dddn',
  'znews',
];

describe('VnMarketNews.getCompanyNews', () => {
  it('defaults to only the sources with a real per-company query (hose/vietstock/google-news)', async () => {
    const client = new VnMarketNews({ sources: ALL_SOURCE_NAMES.map(stubSource) });
    const result = await client.getCompanyNews({ ticker: 'HPG' });

    const sourcesQueried = new Set(result.items.map((item) => item.source));
    expect(sourcesQueried).toEqual(new Set(['hose', 'vietstock', 'google-news']));
  });

  it('honors an explicit sources list, including low-yield heuristic sources', async () => {
    const client = new VnMarketNews({ sources: ALL_SOURCE_NAMES.map(stubSource) });
    const result = await client.getCompanyNews({ ticker: 'HPG', sources: ['cafef'] });

    expect(result.items.map((item) => item.source)).toEqual(['cafef']);
  });
});
