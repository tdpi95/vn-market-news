import { httpGetJson, httpGetText } from '../lib/http.js';
import { parseRss } from '../lib/rss.js';
import { epochSecondsToIso, extractLeadingTicker, parseFeedDate, slugify, stableId, stripHtml } from '../lib/text.js';
import type { CompanyNewsOptions, Language, NewsItem, NewsSource, NewsSourceOptions } from '../types.js';

const SOURCE = 'hose' as const;

// api.hsx.vn is HOSE's public API gateway backing the www.hsx.vn React SPA.
// Confirmed reachable and unauthenticated as of 2026-07 (Swagger docs per
// gateway, e.g. https://api.hsx.vn/n/swagger/v1/swagger.json). All endpoints
// and field names below were verified against live responses, not just docs.
// Note the gateway only serves data (JSON/RSS) — human-facing detail pages
// live on www.hsx.vn, not api.hsx.vn (see toPublicHsxUrl below).
const NEWS_API_BASE = 'https://api.hsx.vn/n/api/v1.0';
// The "l" (listing) gateway's securities/stock endpoint resolves a ticker to
// the numeric id the news API expects as `relatedId`. Note: api.hsx.vn/s/
// ("secorgs") is for brokerage member firms, NOT listed companies — an easy
// mix-up since both expose a similarly-shaped "code" field.
const SECURITIES_API_BASE = 'https://api.hsx.vn/l/api/v1.0';
const MARKET_NEWS_RSS = 'https://api.hsx.vn/n/api/v1/News/NewsByCateFeed/21';

// The API gateway's own `/tin-tuc/{slug}/{id}` links (both in this RSS feed
// and constructible from the JSON API) 404 when fetched directly — that path
// is only served by the www.hsx.vn frontend SPA, which routes by the
// trailing id regardless of slug. Always rewrite to the www host before
// exposing a url to callers.
const HSX_API_HOST = 'https://api.hsx.vn';
const HSX_WEB_HOST = 'https://www.hsx.vn';

function toPublicHsxUrl(url: string): string {
  return url.startsWith(HSX_API_HOST) ? HSX_WEB_HOST + url.slice(HSX_API_HOST.length) : url;
}

/** newstype: 1=news, 2=document, 3=event, 4=annual report, 5=regulation. */
const NEWS_TYPE_ANNOUNCEMENT = 1;

function langCode(lang: Language | undefined): 1 | 2 {
  return lang === 'en' ? 2 : 1;
}

interface HoseSecuritiesRecord {
  id: number;
  code: string;
  name?: string;
}

interface HoseSecuritiesListResponse {
  data?: { list?: HoseSecuritiesRecord[] };
  success?: boolean;
}

interface HoseNewsRecord {
  id: number;
  title: string;
  code?: string | null;
  catName?: string | null;
  publishFrom?: number;
  createdDate?: number;
  summary?: string | null;
}

interface HoseNewsListResponse {
  data?: { list?: HoseNewsRecord[] };
  success?: boolean;
}

function recordToNewsItem(record: HoseNewsRecord, lang: Language, queriedTicker?: string): NewsItem {
  const publishedEpoch = record.publishFrom ?? record.createdDate;
  const publishedAt = publishedEpoch ? epochSecondsToIso(publishedEpoch) : new Date().toISOString();
  // This list endpoint doesn't expose a slug field, so one is derived from
  // the title; the www.hsx.vn SPA routes by id regardless of slug accuracy.
  const title = stripHtml(record.title) ?? record.title;
  const url = `${HSX_WEB_HOST}/tin-tuc/${slugify(title)}/${record.id}`;
  const declaredTicker = record.code ?? extractLeadingTicker(title);
  const tickers = declaredTicker ? [declaredTicker.toUpperCase()] : queriedTicker ? [queriedTicker.toUpperCase()] : [];
  return {
    id: stableId(SOURCE, String(record.id)),
    source: SOURCE,
    sourceType: 'official_disclosure',
    title,
    summary: stripHtml(record.summary ?? undefined),
    url,
    publishedAt,
    fetchedAt: new Date().toISOString(),
    tickers,
    tickerConfidence: declaredTicker ? 'declared' : queriedTicker ? 'query' : undefined,
    category: record.catName ?? undefined,
    language: lang,
    raw: record,
  };
}

export class HoseSource implements NewsSource {
  readonly name = SOURCE;

  async fetchMarketNews(opts: NewsSourceOptions = {}): Promise<NewsItem[]> {
    const xml = await httpGetText(SOURCE, MARKET_NEWS_RSS, { signal: opts.signal });
    const rssItems = parseRss(SOURCE, xml);
    const limit = opts.limit ?? rssItems.length;
    return rssItems.slice(0, limit).map((item) => {
      const title = stripHtml(item.title) ?? item.title;
      const leadingTicker = extractLeadingTicker(title);
      return {
        id: stableId(SOURCE, item.guid ?? item.link),
        source: SOURCE,
        sourceType: 'official_disclosure',
        title,
        summary: stripHtml(item.description),
        url: toPublicHsxUrl(item.link),
        publishedAt: parseFeedDate(item.pubDate),
        fetchedAt: new Date().toISOString(),
        tickers: leadingTicker ? [leadingTicker] : [],
        tickerConfidence: leadingTicker ? 'declared' : undefined,
        category: item.category?.[0],
        language: opts.lang ?? 'vi',
        raw: item,
      };
    });
  }

  async fetchCompanyNews(ticker: string, opts: CompanyNewsOptions = {}): Promise<NewsItem[]> {
    const lang = langCode(opts.lang);
    const securitiesId = await this.resolveSecuritiesId(ticker, lang, opts.signal);
    if (securitiesId === undefined) return [];

    const limit = opts.limit ?? 20;
    const json = await httpGetJson<HoseNewsListResponse>(
      SOURCE,
      `${NEWS_API_BASE}/${lang}/news/newstype/${securitiesId}/${NEWS_TYPE_ANNOUNCEMENT}?pageIndex=1&pageSize=${limit}`,
      { signal: opts.signal },
    );

    const records = json.data?.list ?? [];
    return records.map((record) => recordToNewsItem(record, opts.lang ?? 'vi', ticker));
  }

  private async resolveSecuritiesId(
    ticker: string,
    lang: 1 | 2,
    signal?: AbortSignal,
  ): Promise<number | undefined> {
    const json = await httpGetJson<HoseSecuritiesListResponse>(
      SOURCE,
      `${SECURITIES_API_BASE}/${lang}/securities/stock?code=${encodeURIComponent(ticker.toUpperCase())}`,
      { signal },
    );
    const list = json.data?.list ?? [];
    const match = list.find((s) => s.code?.toUpperCase() === ticker.toUpperCase());
    return match?.id ?? list[0]?.id;
  }
}
