import { httpGetJson } from '../lib/http.js';
import { ddmmyyyyToIso, naiveVnTimestampToIso } from '../lib/vn-date.js';
import { stripHtml } from '../lib/text.js';
import { SourceParseError } from '../errors.js';
import type {
  CompanyCapitalHistoryEntry,
  CompanyInfoResult,
  CompanyLaborStructureEntry,
  CompanyOfficer,
  CompanyOwnershipGroup,
  CompanyProfile,
  CompanyShareholder,
  CompanySubsidiary,
} from '../company-types.js';

const SOURCE = 'kbs-company';

/**
 * Company profile/officers/shareholders/ownership/subsidiaries/capital
 * history for HOSE/HNX-listed companies, sourced from the same KB
 * Securities "KB Buddy" backend as `KbsFinanceSource` — one call returns
 * every group at once, so `getCompanyInfo` fetches once and fans the
 * response out into the result's sub-arrays.
 *
 * Confirmed live (2026-07). Known quirks handled here:
 * - The API exposes both a rounded charter capital in `CC` (billions VND)
 *   and a full-precision figure in `KLCPNY`; this uses `KLCPNY` (falling
 *   back to `CC * 1e9`) so `profile.charterCapital` is always raw VND, not
 *   billions.
 * - `SFV` (nominally "free float" in some undocumented references) was
 *   found to always exactly equal `FV` (par value) across every ticker
 *   checked — it's a duplicate field, not free-float data, so it's dropped
 *   rather than exposed under a misleading name.
 * - `FD` (founded date) is sometimes an empty string; `ddmmyyyyToIso`
 *   returns undefined for anything that isn't "DD/MM/YYYY".
 * - Officer records' own `FD` field is a different, freeform thing (a
 *   start year, or a note like "TV Độc lập" for independent members) —
 *   left as a raw string rather than forced into a date.
 */
const BASE_URL = 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/stockinfo/profile';

interface KbsSubsidiaryRow {
  D?: string;
  NM: string;
  CC?: number;
  OR?: number;
  CR?: string;
}

interface KbsLeaderRow {
  FD?: string;
  PN?: string;
  NM: string;
  PO?: string;
}

interface KbsOwnershipRow {
  NM: string;
  OR?: number;
  SH?: number;
  D?: string;
}

interface KbsShareholderRow {
  NM: string;
  D?: string;
  V?: number;
  OR?: number;
}

interface KbsCapitalHistoryRow {
  D?: string;
  V: number;
  C?: string;
}

interface KbsLaborStructureRow {
  Name: string;
  NameEn?: string;
  Value?: number;
  Rate?: number;
}

interface KbsProfileResponse {
  SM?: string;
  SB?: string;
  FD?: string;
  CC?: number;
  HM?: number;
  LD?: string;
  FV?: number;
  EX?: string;
  LP?: number;
  CTP?: string;
  CTPP?: string;
  IS?: string;
  ISP?: string;
  FP?: string | null;
  BP?: string;
  TC?: string;
  KT?: string;
  TY?: string;
  ADD?: string;
  PHONE?: string;
  FAX?: string;
  EMAIL?: string;
  URL?: string;
  BRANCH?: string;
  HS?: string;
  KLCPNY?: number;
  KLCPLH?: number;
  AD?: string;
  Subsidiaries?: KbsSubsidiaryRow[];
  Leaders?: KbsLeaderRow[];
  Ownership?: KbsOwnershipRow[];
  Shareholders?: KbsShareholderRow[];
  CharterCapital?: KbsCapitalHistoryRow[];
  LaborStructure?: KbsLaborStructureRow[];
}

function toProfile(symbol: string, data: KbsProfileResponse): CompanyProfile {
  return {
    symbol,
    companyType: data.TY,
    businessModel: stripHtml(data.SM),
    history: stripHtml(data.HS),
    foundedDate: ddmmyyyyToIso(data.FD),
    listingDate: ddmmyyyyToIso(data.LD),
    exchange: data.EX,
    charterCapital: data.KLCPNY ?? (data.CC != null ? data.CC * 1e9 : undefined),
    parValue: data.FV,
    listingPrice: data.LP,
    outstandingShares: data.KLCPLH,
    numberOfEmployees: data.HM,
    ceoName: data.CTP,
    ceoPosition: data.CTPP,
    inspectorName: data.IS,
    inspectorPosition: data.ISP,
    auditor: data.KT,
    establishmentLicense: data.FP ?? undefined,
    businessCode: data.BP,
    taxId: data.TC,
    address: data.ADD,
    phone: data.PHONE,
    fax: data.FAX,
    email: data.EMAIL?.trim() || undefined,
    website: data.URL,
    branches: data.BRANCH,
    asOfDate: data.AD ? naiveVnTimestampToIso(data.AD) : undefined,
  };
}

function toOfficer(row: KbsLeaderRow): CompanyOfficer {
  return { name: row.NM, position: row.PN, positionEn: row.PO, fromDate: row.FD };
}

function toShareholder(row: KbsShareholderRow): CompanyShareholder {
  return {
    name: row.NM,
    sharesOwned: row.V,
    ownershipPercent: row.OR,
    updatedAt: row.D ? naiveVnTimestampToIso(row.D) : undefined,
  };
}

function toOwnershipGroup(row: KbsOwnershipRow): CompanyOwnershipGroup {
  return {
    ownerType: row.NM,
    sharesOwned: row.SH,
    ownershipPercent: row.OR,
    updatedAt: row.D ? naiveVnTimestampToIso(row.D) : undefined,
  };
}

function toSubsidiary(row: KbsSubsidiaryRow): CompanySubsidiary {
  return {
    name: row.NM,
    charterCapital: row.CC,
    ownershipPercent: row.OR,
    currency: row.CR,
    updatedAt: row.D ? naiveVnTimestampToIso(row.D) : undefined,
  };
}

function toCapitalHistoryEntry(row: KbsCapitalHistoryRow): CompanyCapitalHistoryEntry {
  return { date: ddmmyyyyToIso(row.D), charterCapital: row.V, currency: row.C };
}

function toLaborStructureEntry(row: KbsLaborStructureRow): CompanyLaborStructureEntry {
  return { name: row.Name, nameEn: row.NameEn, value: row.Value, ratePercent: row.Rate };
}

export interface GetCompanyInfoOptions {
  signal?: AbortSignal;
}

export class KbsCompanySource {
  async getCompanyInfo(ticker: string, opts: GetCompanyInfoOptions = {}): Promise<CompanyInfoResult> {
    const symbol = ticker.toUpperCase();
    const params = new URLSearchParams({ l: '1' });

    const json = await httpGetJson<KbsProfileResponse>(SOURCE, `${BASE_URL}/${symbol}?${params.toString()}`, {
      signal: opts.signal,
    });

    if (!json.SB) {
      throw new SourceParseError(SOURCE, `response missing profile fields for "${symbol}" — the API shape likely changed`);
    }

    return {
      ticker: symbol,
      profile: toProfile(symbol, json),
      officers: (json.Leaders ?? []).map(toOfficer),
      shareholders: (json.Shareholders ?? []).map(toShareholder),
      ownership: (json.Ownership ?? []).map(toOwnershipGroup),
      subsidiaries: (json.Subsidiaries ?? []).map(toSubsidiary),
      capitalHistory: (json.CharterCapital ?? []).map(toCapitalHistoryEntry),
      laborStructure: (json.LaborStructure ?? []).map(toLaborStructureEntry),
      fetchedAt: new Date().toISOString(),
      source: 'kbs',
      raw: json,
    };
  }
}
