import { z } from 'zod';

export const FinancialStatementTypeSchema = z.enum(['balance_sheet', 'income_statement', 'cash_flow', 'ratios']);
export type FinancialStatementType = z.infer<typeof FinancialStatementTypeSchema>;

export const FinancialPeriodTypeSchema = z.enum(['year', 'quarter']);
export type FinancialPeriodType = z.infer<typeof FinancialPeriodTypeSchema>;

/** One reporting period (a fiscal year or quarter) a statement's values are given for. */
export const FinancialPeriodSchema = z.object({
  /** e.g. "2025" for a fiscal year, "2025-Q4" for a quarter. Matches the keys in FinancialLineItem.values. */
  label: z.string(),
  year: z.number(),
  /** 1-4, present only when periodType is 'quarter'. */
  quarter: z.number().optional(),
  /** ISO 8601 date the report was filed/published, when known. */
  reportDate: z.string().optional(),
  /** true = consolidated group figures; false = standalone/parent-company-only. */
  consolidated: z.boolean(),
  auditStatus: z.enum(['audited', 'reviewed', 'unaudited']).optional(),
});
export type FinancialPeriod = z.infer<typeof FinancialPeriodSchema>;

/** One line item (e.g. "Total assets", "ROE") across all requested periods. */
export const FinancialLineItemSchema = z.object({
  /** English label, primary for AI consumption. */
  name: z.string(),
  nameVi: z.string().optional(),
  /** e.g. "%" for ratios; absent for statement line items, which are all in the same currency/unitScale. */
  unit: z.string().optional(),
  /** Hierarchy depth for indentation/rollups (0 = top-level, e.g. "ASSETS"). */
  level: z.number(),
  section: z.string().optional(),
  sectionVi: z.string().optional(),
  /** Value per period, keyed by FinancialPeriod.label. null when not reported for that period. */
  values: z.record(z.string(), z.number().nullable()),
});
export type FinancialLineItem = z.infer<typeof FinancialLineItemSchema>;

export const FinancialStatementResultSchema = z.object({
  ticker: z.string(),
  statementType: FinancialStatementTypeSchema,
  periodType: FinancialPeriodTypeSchema,
  currency: z.string(),
  /** Multiply statement values by this to get raw currency units. Not meaningful for `ratios` (each line item carries its own `unit` instead). */
  unitScale: z.number().optional(),
  /** Ordered as returned by the source (most-recent-first, in practice). */
  periods: z.array(FinancialPeriodSchema),
  items: z.array(FinancialLineItemSchema),
  fetchedAt: z.string(),
  source: z.enum(['kbs', 'vci']),
  raw: z.unknown().optional(),
});
export type FinancialStatementResult = z.infer<typeof FinancialStatementResultSchema>;
