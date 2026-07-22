import { httpGetText } from '../lib/http.js';
import { parseRss } from '../lib/rss.js';
import { extractTickers, parseFeedDate, stableId, stripHtml } from '../lib/text.js';
import type { CompanyNewsOptions, Language, NewsItem, NewsSource, NewsSourceOptions } from '../types.js';

const SOURCE = 'cafef' as const;

// CafeF publishes no per-ticker RSS feed (confirmed during research — only
// topic/category feeds exist, listed at https://cafef.vn/rss.chn). Company
// news is therefore approximated by filtering the general channels for
// ticker mentions in the title, which is a heuristic, not a guarantee of
// completeness or precision.
const DEFAULT_MARKET_RSS_CHANNELS = [
  { url: 'https://cafef.vn/thi-truong-chung-khoan.rss', category: 'thi-truong-chung-khoan' },
  { url: 'https://cafef.vn/doanh-nghiep.rss', category: 'doanh-nghiep' },
  { url: 'https://cafef.vn/tai-chinh-ngan-hang.rss', category: 'tai-chinh-ngan-hang' },
  { url: 'https://cafef.vn/vi-mo-dau-tu.rss', category: 'vi-mo-dau-tu' },
];

async function fetchChannel(
  url: string,
  category: string,
  lang: Language,
  signal?: AbortSignal,
): Promise<NewsItem[]> {
  const xml = await httpGetText(SOURCE, url, { signal });
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
      language: lang,
      raw: item,
    };
  });
}

export class CafefSource implements NewsSource {
  readonly name = SOURCE;

  async fetchMarketNews(opts: NewsSourceOptions = {}): Promise<NewsItem[]> {
    const lang = opts.lang ?? 'vi';
    const results = await Promise.allSettled(
      DEFAULT_MARKET_RSS_CHANNELS.map(({ url, category }) => fetchChannel(url, category, lang, opts.signal)),
    );
    const items = results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
    return opts.limit ? items.slice(0, opts.limit) : items;
  }

  async fetchCompanyNews(ticker: string, opts: CompanyNewsOptions = {}): Promise<NewsItem[]> {
    const all = await this.fetchMarketNews({ ...opts, limit: undefined });
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
}
