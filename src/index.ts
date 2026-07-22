export { VnMarketNews, defaultSources } from './client.js';
export type { VnMarketNewsOptions } from './client.js';

export {
  NewsItemSchema,
  NewsFeedResultSchema,
  SourceNameSchema,
  SourceTypeSchema,
  LanguageSchema,
} from './types.js';
export type {
  NewsItem,
  NewsFeedResult,
  NewsSource,
  NewsSourceOptions,
  CompanyNewsOptions,
  SourceName,
  SourceType,
  SourceError,
  Language,
  MarketNewsQuery,
  CompanyNewsQuery,
  SearchNewsQuery,
} from './types.js';

export { SourceHttpError, SourceParseError, SourceUnavailableError } from './errors.js';

export { HoseSource } from './sources/hose.js';
export { VietstockSource } from './sources/vietstock.js';
export { CafefSource } from './sources/cafef.js';
export { GoogleNewsSource } from './sources/google-news.js';
export type { GoogleNewsSourceOptions } from './sources/google-news.js';

export { dedupeNewsItems, sortByPublishedAtDesc } from './lib/dedupe.js';
export { parseRss } from './lib/rss.js';
export type { RssItem } from './lib/rss.js';
export {
  stripHtml,
  extractTickers,
  toMarkdownDigest,
  parseFeedDate,
  epochSecondsToIso,
  stableId,
  slugify,
} from './lib/text.js';
