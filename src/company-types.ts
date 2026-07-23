import { z } from 'zod';

/** Static profile fields — business description, registration info, contact details. */
export const CompanyProfileSchema = z.object({
  symbol: z.string(),
  companyType: z.string().optional(),
  businessModel: z.string().optional(),
  history: z.string().optional(),
  foundedDate: z.string().optional(),
  listingDate: z.string().optional(),
  exchange: z.string().optional(),
  /** ICB sector/industry classification — only populated by sources that expose it (currently VCI, not KBS). */
  sector: z.string().optional(),
  sectorVn: z.string().optional(),
  icbCodeLv2: z.string().optional(),
  icbCodeLv4: z.string().optional(),
  /** Charter capital, in raw VND (not thousands/millions). */
  charterCapital: z.number().optional(),
  parValue: z.number().optional(),
  listingPrice: z.number().optional(),
  outstandingShares: z.number().optional(),
  numberOfEmployees: z.number().optional(),
  ceoName: z.string().optional(),
  ceoPosition: z.string().optional(),
  inspectorName: z.string().optional(),
  inspectorPosition: z.string().optional(),
  auditor: z.string().optional(),
  establishmentLicense: z.string().optional(),
  businessCode: z.string().optional(),
  taxId: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  fax: z.string().optional(),
  email: z.string().optional(),
  website: z.string().optional(),
  branches: z.string().optional(),
  asOfDate: z.string().optional(),
});
export type CompanyProfile = z.infer<typeof CompanyProfileSchema>;

/** One board/executive member. `fromDate` is freeform as KBS returns a mix of years and role notes (e.g. "TV Độc lập") rather than a parseable date. */
export const CompanyOfficerSchema = z.object({
  name: z.string(),
  position: z.string().optional(),
  positionEn: z.string().optional(),
  fromDate: z.string().optional(),
});
export type CompanyOfficer = z.infer<typeof CompanyOfficerSchema>;

export const CompanyShareholderSchema = z.object({
  name: z.string(),
  sharesOwned: z.number().optional(),
  ownershipPercent: z.number().optional(),
  updatedAt: z.string().optional(),
});
export type CompanyShareholder = z.infer<typeof CompanyShareholderSchema>;

/** Ownership broken down by holder category (e.g. "CBCNV công ty", "CĐ nước ngoài") rather than by name. */
export const CompanyOwnershipGroupSchema = z.object({
  ownerType: z.string(),
  sharesOwned: z.number().optional(),
  ownershipPercent: z.number().optional(),
  updatedAt: z.string().optional(),
});
export type CompanyOwnershipGroup = z.infer<typeof CompanyOwnershipGroupSchema>;

/** A subsidiary or affiliate. `ownershipPercent` > 50 conventionally marks a subsidiary rather than an affiliate. */
export const CompanySubsidiarySchema = z.object({
  name: z.string(),
  charterCapital: z.number().optional(),
  ownershipPercent: z.number().optional(),
  currency: z.string().optional(),
  updatedAt: z.string().optional(),
});
export type CompanySubsidiary = z.infer<typeof CompanySubsidiarySchema>;

export const CompanyCapitalHistoryEntrySchema = z.object({
  date: z.string().optional(),
  charterCapital: z.number(),
  currency: z.string().optional(),
});
export type CompanyCapitalHistoryEntry = z.infer<typeof CompanyCapitalHistoryEntrySchema>;

export const CompanyLaborStructureEntrySchema = z.object({
  name: z.string(),
  nameEn: z.string().optional(),
  value: z.number().optional(),
  ratePercent: z.number().optional(),
});
export type CompanyLaborStructureEntry = z.infer<typeof CompanyLaborStructureEntrySchema>;

export const CompanySymbolTypeSchema = z.enum(['stock', 'fund', 'bond', 'corpbond', 'cw', 'future']);
export type CompanySymbolType = z.infer<typeof CompanySymbolTypeSchema>;

/** One row of KBS's market-wide symbol listing — ticker to company name, not the detailed profile `getCompanyInfo` returns. */
export const CompanySymbolListingEntrySchema = z.object({
  symbol: z.string(),
  name: z.string().optional(),
  nameEn: z.string().optional(),
  exchange: z.string().optional(),
  type: CompanySymbolTypeSchema,
});
export type CompanySymbolListingEntry = z.infer<typeof CompanySymbolListingEntrySchema>;

export const CompanyInfoResultSchema = z.object({
  ticker: z.string(),
  profile: CompanyProfileSchema,
  officers: z.array(CompanyOfficerSchema),
  shareholders: z.array(CompanyShareholderSchema),
  ownership: z.array(CompanyOwnershipGroupSchema),
  subsidiaries: z.array(CompanySubsidiarySchema),
  capitalHistory: z.array(CompanyCapitalHistoryEntrySchema),
  laborStructure: z.array(CompanyLaborStructureEntrySchema),
  fetchedAt: z.string(),
  source: z.enum(['kbs', 'vci']),
  raw: z.unknown().optional(),
});
export type CompanyInfoResult = z.infer<typeof CompanyInfoResultSchema>;
