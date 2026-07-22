import { z } from 'zod';

export const SourceNameSchema = z.enum([
  'hose',
  'vietstock',
  'cafef',
  'google-news',
  'vnexpress',
  'cafebiz',
  'vneconomy',
  'dddn',
  'znews',
]);
export type SourceName = z.infer<typeof SourceNameSchema>;

export const SourceTypeSchema = z.enum(['official_disclosure', 'news_article']);
export type SourceType = z.infer<typeof SourceTypeSchema>;

export const LanguageSchema = z.enum(['vi', 'en']);
export type Language = z.infer<typeof LanguageSchema>;

/**
 * Normalized news/disclosure item. Every source adapter maps its native
 * response into this shape so downstream consumers (including LLM feeds)
 * see one consistent schema regardless of origin.
 */
export const NewsItemSchema = z.object({
  /** Stable id derived from source + native id or url; stable across re-fetches. */
  id: z.string(),
  source: SourceNameSchema,
  sourceType: SourceTypeSchema,
  title: z.string(),
  /** Plain-text summary/snippet, HTML stripped. */
  summary: z.string().optional(),
  url: z.string().url(),
  /** ISO 8601 timestamp, source's own timezone preserved when known. */
  publishedAt: z.string(),
  /** ISO 8601 timestamp of when this library fetched the item. */
  fetchedAt: z.string(),
  /** Uppercased ticker symbols this item is associated with. May be empty. */
  tickers: z.array(z.string()),
  /** How the tickers were determined: 'declared' from source-provided fields,
   * 'query' because the caller asked for this exact ticker, or 'heuristic'
   * from regex matching over title/summary (lower precision). */
  tickerConfidence: z.enum(['declared', 'query', 'heuristic']).optional(),
  companyName: z.string().optional(),
  /** Free-form category/channel label from the source, not normalized across sources. */
  category: z.string().optional(),
  language: LanguageSchema,
  /** Original source name/byline, when the source itself aggregates from elsewhere (e.g. Vietstock reprints). */
  originalSource: z.string().optional(),
  /** Untouched native payload for traceability/debugging. Not meant for direct AI consumption. */
  raw: z.unknown().optional(),
});
export type NewsItem = z.infer<typeof NewsItemSchema>;

export const NewsQueryTypeSchema = z.enum(['market', 'company', 'search']);

export const SourceErrorSchema = z.object({
  source: SourceNameSchema,
  message: z.string(),
});
export type SourceError = z.infer<typeof SourceErrorSchema>;

/**
 * Top-level result of any fetch. Deliberately includes generatedAt and
 * per-source errors so an AI feed consumer can reason about freshness and
 * partial coverage instead of assuming silent completeness.
 */
export const NewsFeedResultSchema = z.object({
  generatedAt: z.string(),
  query: z.object({
    type: NewsQueryTypeSchema,
    ticker: z.string().optional(),
    keyword: z.string().optional(),
  }),
  items: z.array(NewsItemSchema),
  sourceErrors: z.array(SourceErrorSchema),
});
export type NewsFeedResult = z.infer<typeof NewsFeedResultSchema>;

export interface NewsSourceOptions {
  limit?: number;
  lang?: Language;
  signal?: AbortSignal;
}

export interface CompanyNewsOptions extends NewsSourceOptions {
  companyName?: string;
}

/** Implemented by every source adapter (HOSE, Vietstock, CafeF, Google News, or custom). */
export interface NewsSource {
  readonly name: SourceName;
  fetchMarketNews(opts?: NewsSourceOptions): Promise<NewsItem[]>;
  fetchCompanyNews(ticker: string, opts?: CompanyNewsOptions): Promise<NewsItem[]>;
  search?(keyword: string, opts?: NewsSourceOptions): Promise<NewsItem[]>;
}

export interface MarketNewsQuery extends NewsSourceOptions {
  sources?: SourceName[];
}

export interface CompanyNewsQuery extends CompanyNewsOptions {
  ticker: string;
  sources?: SourceName[];
}

export interface SearchNewsQuery extends NewsSourceOptions {
  keyword: string;
  sources?: SourceName[];
}
