import { describe, expect, it } from 'vitest';
import { dedupeNewsItems, sortByPublishedAtDesc } from '../src/lib/dedupe.js';
import type { NewsItem } from '../src/types.js';

function item(overrides: Partial<NewsItem>): NewsItem {
  return {
    id: 'id',
    source: 'cafef',
    sourceType: 'news_article',
    title: 'Title',
    url: 'https://example.com/a',
    publishedAt: '2026-07-22T00:00:00.000Z',
    fetchedAt: '2026-07-22T00:00:00.000Z',
    tickers: [],
    language: 'vi',
    ...overrides,
  };
}

describe('dedupeNewsItems', () => {
  it('drops items with the same normalized URL', () => {
    const items = [
      item({ id: '1', url: 'https://example.com/a?utm_source=fb' }),
      item({ id: '2', url: 'https://example.com/a' }),
    ];
    expect(dedupeNewsItems(items)).toHaveLength(1);
  });

  it('drops items with the same title on the same day across sources', () => {
    const items = [
      item({ id: '1', source: 'cafef', url: 'https://cafef.vn/x', title: 'HPG tăng mạnh' }),
      item({ id: '2', source: 'vietstock', url: 'https://vietstock.vn/y', title: 'HPG tăng mạnh' }),
    ];
    expect(dedupeNewsItems(items)).toHaveLength(1);
  });

  it('keeps distinct items', () => {
    const items = [
      item({ id: '1', url: 'https://example.com/a', title: 'A' }),
      item({ id: '2', url: 'https://example.com/b', title: 'B' }),
    ];
    expect(dedupeNewsItems(items)).toHaveLength(2);
  });
});

describe('sortByPublishedAtDesc', () => {
  it('sorts newest first', () => {
    const items = [
      item({ id: '1', publishedAt: '2026-07-20T00:00:00.000Z' }),
      item({ id: '2', publishedAt: '2026-07-22T00:00:00.000Z' }),
    ];
    const sorted = sortByPublishedAtDesc(items);
    expect(sorted[0].id).toBe('2');
  });
});
