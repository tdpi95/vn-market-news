import { httpGetText } from '../lib/http.js';
import { parseRss } from '../lib/rss.js';
import { extractTickers, parseFeedDate, stableId, stripHtml } from '../lib/text.js';
import type { CompanyNewsOptions, Language, NewsItem, NewsSource, NewsSourceOptions } from '../types.js';

const SOURCE = 'google-news' as const;

const DEFAULT_MARKET_QUERY = '(chứng khoán OR "VN-Index") Việt Nam when:2d';

function buildUrl(query: string, lang: Language): string {
  const hl = lang === 'en' ? 'en' : 'vi';
  const gl = lang === 'en' ? 'US' : 'VN';
  const ceid = `${gl}:${hl}`;
  const params = new URLSearchParams({ q: query, hl, gl, ceid });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

/** Google News RSS titles are formatted "Headline - Publisher"; split that out. */
function splitTitleAndPublisher(rawTitle: string): { title: string; publisher?: string } {
  const idx = rawTitle.lastIndexOf(' - ');
  if (idx === -1) return { title: rawTitle };
  return { title: rawTitle.slice(0, idx), publisher: rawTitle.slice(idx + 3) };
}

async function fetchByQuery(
  query: string,
  lang: Language,
  limit: number | undefined,
  signal: AbortSignal | undefined,
  extraTickers: string[] = [],
): Promise<NewsItem[]> {
  const url = buildUrl(query, lang);
  const xml = await httpGetText(SOURCE, url, { signal });
  const items = parseRss(SOURCE, xml).map((item): NewsItem => {
    const { title: rawTitle, publisher } = splitTitleAndPublisher(item.title);
    const title = stripHtml(rawTitle) ?? rawTitle;
    const heuristicTickers = extractTickers(title);
    const tickers = extraTickers.length ? extraTickers : heuristicTickers;
    return {
      id: stableId(SOURCE, item.guid ?? item.link),
      source: SOURCE,
      sourceType: 'news_article',
      title,
      summary: stripHtml(item.description),
      url: item.link,
      publishedAt: parseFeedDate(item.pubDate),
      fetchedAt: new Date().toISOString(),
      tickers,
      tickerConfidence: extraTickers.length ? 'query' : heuristicTickers.length ? 'heuristic' : undefined,
      originalSource: publisher,
      language: lang,
      raw: item,
    };
  });
  return limit ? items.slice(0, limit) : items;
}

export interface GoogleNewsSourceOptions {
  /** Overrides the default market-wide query (`(chứng khoán OR "VN-Index") Việt Nam when:2d`). */
  marketQuery?: string;
}

export class GoogleNewsSource implements NewsSource {
  readonly name = SOURCE;
  private readonly marketQuery: string;

  constructor(opts: GoogleNewsSourceOptions = {}) {
    this.marketQuery = opts.marketQuery ?? DEFAULT_MARKET_QUERY;
  }

  async fetchMarketNews(opts: NewsSourceOptions = {}): Promise<NewsItem[]> {
    return fetchByQuery(this.marketQuery, opts.lang ?? 'vi', opts.limit, opts.signal);
  }

  async fetchCompanyNews(ticker: string, opts: CompanyNewsOptions = {}): Promise<NewsItem[]> {
    const query = opts.companyName
      ? `("${ticker}" OR "${opts.companyName}") chứng khoán`
      : `"${ticker}" chứng khoán`;
    return fetchByQuery(query, opts.lang ?? 'vi', opts.limit, opts.signal, [ticker.toUpperCase()]);
  }

  async search(keyword: string, opts: NewsSourceOptions = {}): Promise<NewsItem[]> {
    return fetchByQuery(keyword, opts.lang ?? 'vi', opts.limit, opts.signal);
  }
}
