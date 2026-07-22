import { z } from 'zod';

export const FundAssetTypeSchema = z.enum(['stock', 'bond', 'balanced']);
export type FundAssetType = z.infer<typeof FundAssetTypeSchema>;

/** NAV change, in percent, over various trailing windows. Any window may be absent if the fund doesn't have enough history yet. */
export const FundNavChangeSchema = z.object({
  previous: z.number().optional(),
  ytd: z.number().optional(),
  m1: z.number().optional(),
  m3: z.number().optional(),
  m6: z.number().optional(),
  m12: z.number().optional(),
  m36: z.number().optional(),
  sinceInception: z.number().optional(),
});
export type FundNavChange = z.infer<typeof FundNavChangeSchema>;

export const FundSummarySchema = z.object({
  /** Fmarket's internal numeric id — needed for detail/NAV-history lookups. */
  id: z.number(),
  /** Ticker-like short code investors use to refer to the fund, e.g. "VESAF". */
  shortName: z.string(),
  name: z.string(),
  assetType: FundAssetTypeSchema.optional(),
  managerName: z.string().optional(),
  /** Annual management fee, in percent. */
  managementFee: z.number().optional(),
  /** Latest published NAV per unit, in VND. */
  nav: z.number(),
  inceptionDate: z.string().optional(),
  navChangePercent: FundNavChangeSchema,
  updatedAt: z.string().optional(),
});
export type FundSummary = z.infer<typeof FundSummarySchema>;

/** One position in a fund's top-10 holdings — a stock or a bond, both identified by `code`. */
export const FundHoldingSchema = z.object({
  assetType: z.enum(['stock', 'bond']),
  code: z.string().optional(),
  industry: z.string().optional(),
  /** Share of the fund's net assets, in percent. */
  netAssetPercent: z.number(),
  updatedAt: z.string().optional(),
});
export type FundHolding = z.infer<typeof FundHoldingSchema>;

export const FundIndustryAllocationSchema = z.object({
  industry: z.string(),
  assetPercent: z.number(),
});
export type FundIndustryAllocation = z.infer<typeof FundIndustryAllocationSchema>;

/** Broad asset-class split, e.g. "Cổ phiếu" (stocks) vs "Tiền và tương đương tiền" (cash). */
export const FundAssetAllocationSchema = z.object({
  assetType: z.string(),
  assetPercent: z.number(),
});
export type FundAssetAllocation = z.infer<typeof FundAssetAllocationSchema>;

export const FundNavPointSchema = z.object({
  date: z.string(),
  nav: z.number(),
});
export type FundNavPoint = z.infer<typeof FundNavPointSchema>;

export const FundDetailResultSchema = z.object({
  fund: FundSummarySchema,
  topHoldings: z.array(FundHoldingSchema),
  industryAllocation: z.array(FundIndustryAllocationSchema),
  assetAllocation: z.array(FundAssetAllocationSchema),
  /** Only populated when `includeNavHistory` was requested — a second API call. */
  navHistory: z.array(FundNavPointSchema).optional(),
  fetchedAt: z.string(),
  source: z.literal('fmarket'),
});
export type FundDetailResult = z.infer<typeof FundDetailResultSchema>;
