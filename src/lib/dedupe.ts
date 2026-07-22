import type { NewsItem } from '../types.js';

function normalizeUrlKey(url: string): string {
  try {
    const u = new URL(url);
    u.hash = '';
    // Strip common tracking/query params without dropping meaningful ids.
    ['utm_source', 'utm_medium', 'utm_campaign', 'fbclid', 'gclid'].forEach((p) =>
      u.searchParams.delete(p),
    );
    return `${u.origin}${u.pathname}${u.search}`.toLowerCase().replace(/\/$/, '');
  } catch {
    return url.toLowerCase();
  }
}

function normalizeTitleKey(item: NewsItem): string {
  const day = item.publishedAt.slice(0, 10);
  const title = item.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return `${day}|${title}`;
}

/**
 * Merges near-duplicate items that different sources (or the same source's
 * RSS vs API) report for the same underlying event. Prefers the first
 * occurrence encountered, so pass items pre-sorted by source priority if that
 * matters to you.
 */
export function dedupeNewsItems(items: NewsItem[]): NewsItem[] {
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();
  const result: NewsItem[] = [];

  for (const item of items) {
    const urlKey = normalizeUrlKey(item.url);
    if (seenUrls.has(urlKey)) continue;

    const titleKey = normalizeTitleKey(item);
    if (seenTitles.has(titleKey)) continue;

    seenUrls.add(urlKey);
    seenTitles.add(titleKey);
    result.push(item);
  }

  return result;
}

export function sortByPublishedAtDesc(items: NewsItem[]): NewsItem[] {
  return [...items].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
}
