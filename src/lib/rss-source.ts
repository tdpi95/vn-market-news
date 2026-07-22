import { httpGetText } from './http.js';
import { parseRss } from './rss.js';
import { extractTickers, parseFeedDate, stableId, stripHtml } from './text.js';
import type { CompanyNewsOptions, Language, NewsItem, NewsSource, NewsSourceOptions, SourceName } from '../types.js';

export interface RssChannel {
  url: string;
  category: string;
}

async function fetchChannel(
  source: SourceName,
  channel: RssChannel,
  lang: Language,
  signal?: AbortSignal,
): Promise<NewsItem[]> {
  const xml = await httpGetText(source, channel.url, { signal });
  return parseRss(source, xml).map((item) => {
    const title = stripHtml(item.title) ?? item.title;
    return {
      id: stableId(source, item.guid ?? item.link),
      source,
      sourceType: 'news_article' as const,
      title,
      summary: stripHtml(item.description),
      url: item.link,
      publishedAt: parseFeedDate(item.pubDate),
      fetchedAt: new Date().toISOString(),
      tickers: extractTickers(title),
      tickerConfidence: 'heuristic' as const,
      category: channel.category,
      language: lang,
      raw: item,
    };
  });
}

/**
 * Builds a `NewsSource` for outlets that publish category RSS feeds but no
 * per-ticker feed or structured ticker field. Company news is approximated
 * by filtering titles for ticker mentions — a heuristic, not a guarantee of
 * completeness or precision. Used by CafeF/Cafebiz/VnExpress/VnEconomy/
 * Diễn Đàn Doanh Nghiệp/Znews; see each source's own file for its verified
 * channel URLs and any source-specific caveats.
 */
export function createRssNewsSource(name: SourceName, channels: RssChannel[]): NewsSource {
  async function fetchMarketNews(opts: NewsSourceOptions = {}): Promise<NewsItem[]> {
    const lang = opts.lang ?? 'vi';
    const results = await Promise.allSettled(
      channels.map((channel) => fetchChannel(name, channel, lang, opts.signal)),
    );
    const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    return opts.limit ? items.slice(0, opts.limit) : items;
  }

  async function fetchCompanyNews(ticker: string, opts: CompanyNewsOptions = {}): Promise<NewsItem[]> {
    const all = await fetchMarketNews({ ...opts, limit: undefined });
    const tickerRe = new RegExp(`\\b${ticker.toUpperCase()}\\b`);
    const matched = all
      .filter((item) => tickerRe.test(item.title))
      .map((item) => ({
        ...item,
        tickers: item.tickers.includes(ticker.toUpperCase()) ? item.tickers : [...item.tickers, ticker.toUpperCase()],
        tickerConfidence: 'heuristic' as const,
      }));
    return opts.limit ? matched.slice(0, opts.limit) : matched;
  }

  return { name, fetchMarketNews, fetchCompanyNews };
}
