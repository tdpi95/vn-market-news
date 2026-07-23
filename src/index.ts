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
export { createVnExpressSource } from './sources/vnexpress.js';
export { createCafebizSource } from './sources/cafebiz.js';
export { createVnEconomySource } from './sources/vneconomy.js';
export { createDddnSource } from './sources/dddn.js';
export { createZnewsSource } from './sources/znews.js';
export { KbsFinanceSource } from './sources/kbs-finance.js';
export type { GetFinancialStatementsOptions } from './sources/kbs-finance.js';
export { VciFinanceSource } from './sources/vci-finance.js';
export { KbsCompanySource } from './sources/kbs-company.js';
export type { GetCompanyInfoOptions } from './sources/kbs-company.js';
export { VciCompanySource } from './sources/vci-company.js';
export { KbsListingSource } from './sources/kbs-listing.js';
export type { ListSymbolsOptions } from './sources/kbs-listing.js';
export { FmarketFundSource } from './sources/fmarket-fund.js';
export type { SearchFundsOptions, GetFundDetailOptions } from './sources/fmarket-fund.js';

export {
  FinancialStatementTypeSchema,
  FinancialPeriodTypeSchema,
  FinancialPeriodSchema,
  FinancialLineItemSchema,
  FinancialStatementResultSchema,
} from './finance-types.js';
export type {
  FinancialStatementType,
  FinancialPeriodType,
  FinancialPeriod,
  FinancialLineItem,
  FinancialStatementResult,
} from './finance-types.js';

export {
  CompanyProfileSchema,
  CompanyOfficerSchema,
  CompanyShareholderSchema,
  CompanyOwnershipGroupSchema,
  CompanySubsidiarySchema,
  CompanyCapitalHistoryEntrySchema,
  CompanyLaborStructureEntrySchema,
  CompanyInfoResultSchema,
  CompanySymbolTypeSchema,
  CompanySymbolListingEntrySchema,
} from './company-types.js';
export type {
  CompanyProfile,
  CompanyOfficer,
  CompanyShareholder,
  CompanyOwnershipGroup,
  CompanySubsidiary,
  CompanyCapitalHistoryEntry,
  CompanyLaborStructureEntry,
  CompanyInfoResult,
  CompanySymbolType,
  CompanySymbolListingEntry,
} from './company-types.js';

export {
  FundAssetTypeSchema,
  FundNavChangeSchema,
  FundSummarySchema,
  FundHoldingSchema,
  FundIndustryAllocationSchema,
  FundAssetAllocationSchema,
  FundNavPointSchema,
  FundDetailResultSchema,
} from './fund-types.js';
export type {
  FundAssetType,
  FundNavChange,
  FundSummary,
  FundHolding,
  FundIndustryAllocation,
  FundAssetAllocation,
  FundNavPoint,
  FundDetailResult,
} from './fund-types.js';

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
