import { dedupeNewsItems, sortByPublishedAtDesc } from './lib/dedupe.js';
import { CafefSource } from './sources/cafef.js';
import { GoogleNewsSource } from './sources/google-news.js';
import { HoseSource } from './sources/hose.js';
import { VietstockSource } from './sources/vietstock.js';
import { NewsQueryTypeSchema } from './types.js';
import type {
  CompanyNewsQuery,
  MarketNewsQuery,
  NewsFeedResult,
  NewsItem,
  NewsSource,
  SearchNewsQuery,
  SourceError,
  SourceName,
} from './types.js';
import type { z } from 'zod';

export function defaultSources(): NewsSource[] {
  return [new HoseSource(), new VietstockSource(), new CafefSource(), new GoogleNewsSource()];
}

export interface VnMarketNewsOptions {
  /** Full replacement for the default source list, e.g. `[...defaultSources(), myCustomSource]`. */
  sources?: NewsSource[];
  /** Excludes specific default sources without having to rebuild the list manually. */
  disabledSources?: SourceName[];
}

type QueryType = z.infer<typeof NewsQueryTypeSchema>;

/**
 * Aggregates Vietnam market news/disclosures across sources into one
 * normalized, deduplicated feed. Per-source failures never fail the whole
 * call — they're collected in `sourceErrors` instead, so a broken or
 * rate-limited source degrades the result rather than throwing.
 */
export class VnMarketNews {
  private readonly sources: NewsSource[];

  constructor(opts: VnMarketNewsOptions = {}) {
    let sources = opts.sources ?? defaultSources();
    if (opts.disabledSources?.length) {
      const disabled = new Set(opts.disabledSources);
      sources = sources.filter((s) => !disabled.has(s.name));
    }
    this.sources = sources;
  }

  async getMarketNews(query: MarketNewsQuery = {}): Promise<NewsFeedResult> {
    const selected = this.selectSources(query.sources);
    const { items, errors } = await this.runAll(selected, (s) => s.fetchMarketNews(query));
    return this.buildResult('market', {}, items, errors, query.limit);
  }

  async getCompanyNews(query: CompanyNewsQuery): Promise<NewsFeedResult> {
    const selected = this.selectSources(query.sources);
    const { items, errors } = await this.runAll(selected, (s) => s.fetchCompanyNews(query.ticker, query));
    return this.buildResult('company', { ticker: query.ticker.toUpperCase() }, items, errors, query.limit);
  }

  async search(query: SearchNewsQuery): Promise<NewsFeedResult> {
    const selected = this.selectSources(query.sources).filter((s) => typeof s.search === 'function');
    const { items, errors } = await this.runAll(selected, (s) => s.search!(query.keyword, query));
    return this.buildResult('search', { keyword: query.keyword }, items, errors, query.limit);
  }

  private selectSources(names?: SourceName[]): NewsSource[] {
    if (!names?.length) return this.sources;
    const set = new Set(names);
    return this.sources.filter((s) => set.has(s.name));
  }

  private async runAll(
    sources: NewsSource[],
    fn: (s: NewsSource) => Promise<NewsItem[]>,
  ): Promise<{ items: NewsItem[]; errors: SourceError[] }> {
    const settled = await Promise.allSettled(sources.map((s) => fn(s)));
    const items: NewsItem[] = [];
    const errors: SourceError[] = [];
    settled.forEach((result, i) => {
      if (result.status === 'fulfilled') {
        items.push(...result.value);
      } else {
        const reason = result.reason;
        errors.push({
          source: sources[i].name,
          message: reason instanceof Error ? reason.message : String(reason),
        });
      }
    });
    return { items, errors };
  }

  private buildResult(
    type: QueryType,
    extra: { ticker?: string; keyword?: string },
    items: NewsItem[],
    errors: SourceError[],
    limit?: number,
  ): NewsFeedResult {
    const deduped = sortByPublishedAtDesc(dedupeNewsItems(items));
    return {
      generatedAt: new Date().toISOString(),
      query: { type, ...extra },
      items: limit ? deduped.slice(0, limit) : deduped,
      sourceErrors: errors,
    };
  }
}
