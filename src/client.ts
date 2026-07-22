import { dedupeNewsItems, sortByPublishedAtDesc } from './lib/dedupe.js';
import { createCafebizSource } from './sources/cafebiz.js';
import { CafefSource } from './sources/cafef.js';
import { createDddnSource } from './sources/dddn.js';
import { GoogleNewsSource } from './sources/google-news.js';
import { HoseSource } from './sources/hose.js';
import { FmarketFundSource } from './sources/fmarket-fund.js';
import type { GetFundDetailOptions, SearchFundsOptions } from './sources/fmarket-fund.js';
import { KbsFinanceSource } from './sources/kbs-finance.js';
import type { GetFinancialStatementsOptions } from './sources/kbs-finance.js';
import { createVnEconomySource } from './sources/vneconomy.js';
import { createVnExpressSource } from './sources/vnexpress.js';
import { VietstockSource } from './sources/vietstock.js';
import { createZnewsSource } from './sources/znews.js';
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
import type { FinancialStatementResult } from './finance-types.js';
import type { FundDetailResult, FundSummary } from './fund-types.js';
import type { z } from 'zod';

export function defaultSources(): NewsSource[] {
  return [
    new HoseSource(),
    new VietstockSource(),
    new CafefSource(),
    new GoogleNewsSource(),
    createVnExpressSource(),
    createCafebizSource(),
    createVnEconomySource(),
    createDddnSource(),
    createZnewsSource(),
  ];
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
  private readonly financeSource = new KbsFinanceSource();
  private readonly fundSource = new FmarketFundSource();

  constructor(opts: VnMarketNewsOptions = {}) {
    let sources = opts.sources ?? defaultSources();
    if (opts.disabledSources?.length) {
      const disabled = new Set(opts.disabledSources);
      sources = sources.filter((s) => !disabled.has(s.name));
    }
    this.sources = sources;
  }

  /**
   * Structured financial statements/ratios for a ticker (balance sheet,
   * income statement, cash flow, or ratios), sourced from KB Securities —
   * see `KbsFinanceSource` for details and caveats. Unlike the news
   * methods above, this hits a single source and throws on failure rather
   * than degrading into `sourceErrors`, since there's no fallback source.
   */
  async getFinancialStatements(
    ticker: string,
    opts: GetFinancialStatementsOptions = {},
  ): Promise<FinancialStatementResult> {
    return this.financeSource.getFinancialStatements(ticker, opts);
  }

  /**
   * Search/list open-end mutual funds by short name or name substring
   * (pass '' to list all), sourced from Fmarket — see `FmarketFundSource`.
   * Throws on failure rather than degrading into `sourceErrors`.
   */
  async searchFunds(query = '', opts: SearchFundsOptions = {}): Promise<FundSummary[]> {
    return this.fundSource.searchFunds(query, opts);
  }

  /**
   * NAV, top holdings, and industry/asset allocation for one fund, by its
   * short name (e.g. "VESAF"). Set `includeNavHistory` for full NAV history
   * since inception (a separate, heavier call).
   */
  async getFundDetail(symbol: string, opts: GetFundDetailOptions = {}): Promise<FundDetailResult> {
    return this.fundSource.getFundDetail(symbol, opts);
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
