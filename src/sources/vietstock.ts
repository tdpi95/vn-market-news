import { httpPostJson, httpGetText } from '../lib/http.js';
import { parseRss } from '../lib/rss.js';
import { absoluteUrl, extractLeadingTicker, extractTickers, parseFeedDate, stableId, stripHtml } from '../lib/text.js';
import type { CompanyNewsOptions, Language, NewsItem, NewsSource, NewsSourceOptions } from '../types.js';

const SOURCE = 'vietstock' as const;
const VIETSTOCK_BASE = 'https://vietstock.vn';

// dc.vietstock.vn is an undocumented internal API backing vietstock.vn's
// search box; confirmed live/unauthenticated during research (2026-07) but
// treat as fragile/unofficial — Vietstock may change it without notice.
const SEARCH_API_VI = 'https://dc.vietstock.vn/api/Search/SearchArticleNewAsync';
const SEARCH_API_EN = 'https://dc.vietstock.vn/api/Search/SearchArticleEnNewAsync';

// Topic/channel RSS feeds (confirmed live). Vietstock has no per-ticker RSS,
// so company-specific queries go through the search API instead.
const DEFAULT_MARKET_RSS_CHANNELS = [
  { url: 'https://vietstock.vn/830/chung-khoan/co-phieu.rss', category: 'co-phieu' },
  { url: 'https://vietstock.vn/739/chung-khoan/giao-dich-noi-bo.rss', category: 'giao-dich-noi-bo' },
];

interface VietstockSearchRecord {
  ArticleID: number;
  Title: string;
  Head?: string;
  PublishTime: string;
  Tag?: string;
  URL: string;
  Source?: string;
}

interface VietstockSearchResponse {
  totalCount?: number;
  success?: boolean;
  data?: VietstockSearchRecord[];
}

const TICKER_TAG_RE = /^[A-Z]{3,4}$/;

function tickersFromTag(tag: string | undefined): string[] {
  if (!tag) return [];
  return tag
    .split(',')
    .map((t) => t.trim().toUpperCase())
    .filter((t) => TICKER_TAG_RE.test(t));
}

function recordToNewsItem(record: VietstockSearchRecord, lang: Language): NewsItem {
  const url = absoluteUrl(VIETSTOCK_BASE, record.URL);
  const title = stripHtml(record.Title) ?? record.Title;
  const tagTickers = tickersFromTag(record.Tag);
  const leadingTicker = extractLeadingTicker(title);
  const tickers = tagTickers.length ? tagTickers : leadingTicker ? [leadingTicker] : [];
  return {
    id: stableId(SOURCE, String(record.ArticleID)),
    source: SOURCE,
    sourceType: 'news_article',
    title,
    summary: stripHtml(record.Head),
    url,
    publishedAt: new Date(record.PublishTime).toISOString(),
    fetchedAt: new Date().toISOString(),
    tickers,
    tickerConfidence: tickers.length ? 'declared' : undefined,
    originalSource: record.Source,
    language: lang,
    raw: record,
  };
}

async function searchArticles(
  keyword: string,
  lang: Language,
  limit: number,
  signal?: AbortSignal,
): Promise<NewsItem[]> {
  const endpoint = lang === 'en' ? SEARCH_API_EN : SEARCH_API_VI;
  const params = new URLSearchParams({
    keySearch: keyword,
    currentPage: '1',
    pageSize: String(limit),
    skip: '0',
    filterTime: '0',
  });
  const url = `${endpoint}?${params.toString()}`;
  const json = await httpPostJson<VietstockSearchResponse>(
    SOURCE,
    url,
    { keySearch: keyword, currentPage: 1, pageSize: limit, skip: 0, filterTime: 0 },
    { signal },
  );
  return (json.data ?? []).map((record) => recordToNewsItem(record, lang));
}

export class VietstockSource implements NewsSource {
  readonly name = SOURCE;

  async fetchMarketNews(opts: NewsSourceOptions = {}): Promise<NewsItem[]> {
    const perChannelLimit = opts.limit ?? 20;
    const results = await Promise.allSettled(
      DEFAULT_MARKET_RSS_CHANNELS.map(async ({ url, category }) => {
        const xml = await httpGetText(SOURCE, url, { signal: opts.signal });
        return parseRss(SOURCE, xml).map((item) => {
          const title = stripHtml(item.title) ?? item.title;
          return {
            id: stableId(SOURCE, item.guid ?? item.link),
            source: SOURCE,
            sourceType: 'news_article' as const,
            title,
            summary: stripHtml(item.description),
            url: item.link,
            publishedAt: parseFeedDate(item.pubDate),
            fetchedAt: new Date().toISOString(),
            tickers: extractTickers(title),
            tickerConfidence: 'heuristic' as const,
            category,
            language: (opts.lang ?? 'vi') as Language,
            raw: item,
          };
        });
      }),
    );

    const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    return items.slice(0, perChannelLimit * DEFAULT_MARKET_RSS_CHANNELS.length);
  }

  async fetchCompanyNews(ticker: string, opts: CompanyNewsOptions = {}): Promise<NewsItem[]> {
    const items = await searchArticles(ticker, opts.lang ?? 'vi', opts.limit ?? 20, opts.signal);
    return items.map((item) => ({
      ...item,
      tickers: item.tickers.length ? item.tickers : [ticker.toUpperCase()],
      tickerConfidence: item.tickers.length ? item.tickerConfidence : 'query',
    }));
  }

  async search(keyword: string, opts: NewsSourceOptions = {}): Promise<NewsItem[]> {
    return searchArticles(keyword, opts.lang ?? 'vi', opts.limit ?? 20, opts.signal);
  }
}
