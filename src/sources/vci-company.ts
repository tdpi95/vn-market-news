import { httpGetJson } from '../lib/http.js';
import { naiveVnTimestampToIso } from '../lib/vn-date.js';
import { stripHtml } from '../lib/text.js';
import { SourceParseError } from '../errors.js';
import type {
  CompanyInfoResult,
  CompanyOfficer,
  CompanyOwnershipGroup,
  CompanyProfile,
  CompanyShareholder,
  CompanySubsidiary,
} from '../company-types.js';

const SOURCE = 'vci-company';

/**
 * Company profile/officers/shareholders/ownership/subsidiaries for
 * HOSE/HNX/UPCOM-listed companies, sourced from VCI (Vietcap)'s public
 * "iq-insight-service" backend — the same API vnstock's
 * `vnstock.explorer.vci.company.Company` class uses.
 *
 * Confirmed live (2026-07). Unlike `KbsCompanySource`, this has no single
 * combined endpoint — the profile, ownership breakdown, named shareholder
 * list, and subsidiary/affiliate relationships each live behind their own
 * URL, so `getCompanyInfo` fans out 4 requests and merges the results.
 * Trade-offs vs KBS, worth knowing before picking a source:
 * - Has `sector`/`sectorVn`/ICB codes on the profile — KBS has none of this.
 * - Has no charter-capital-history or labor-structure equivalent — those
 *   arrays are always empty here.
 * - Officers aren't a distinct endpoint; they're the named-shareholder rows
 *   that happen to carry a `positionName`, so there's no tenure/`fromDate`
 *   field like KBS's `Leaders[].FD`.
 * - `exchange`, charter capital, par/listing price, and all registration
 *   info (address/phone/tax id/auditor/etc.) simply aren't exposed by this
 *   API — left undefined rather than guessed at.
 * - No auth needed, but the API only responds to requests carrying VCI's
 *   trading-site `Origin`/`Referer` (a plain default User-Agent is fine).
 */
const BASE_URL = 'https://iq.vietcap.com.vn/api/iq-insight-service/v1/company';
const VCI_HEADERS = {
  origin: 'https://trading.vietcap.com.vn',
  referer: 'https://trading.vietcap.com.vn/',
};

interface VciEnvelope<T> {
  data: T | null;
}

interface VciCompanyDetails {
  comTypeCode?: string;
  sector?: string;
  sectorVn?: string;
  icbCodeLv2?: string;
  icbCodeLv4?: string;
  profile?: string;
  enProfile?: string;
  numberOfSharesMktCap?: number;
  listingDate?: string;
}

interface VciShareholderStructure {
  stateVolume?: number;
  statePercentage?: number;
  foreignerVolume?: number;
  foreignPercentage?: number;
  otherVolume?: number;
  otherPercentage?: number;
  bodPercentage?: number;
  institutionPercentage?: number;
}

interface VciShareholderRow {
  ownerName: string;
  positionName?: string | null;
  positionNameEn?: string | null;
  quantity?: number;
  percentage?: number;
  ownerType?: string;
  updateDate?: string;
}

interface VciRelationshipRow {
  rightOrganNameVi?: string;
  rightOrganNameEn?: string;
  ownedPercentage?: number;
}

interface VciRelationship {
  affiliates?: VciRelationshipRow[];
  subsidiaries?: VciRelationshipRow[];
}

function toProfile(symbol: string, data: VciCompanyDetails): CompanyProfile {
  return {
    symbol,
    companyType: data.comTypeCode,
    businessModel: stripHtml(data.profile) ?? stripHtml(data.enProfile),
    listingDate: data.listingDate ? naiveVnTimestampToIso(data.listingDate) : undefined,
    sector: data.sector,
    sectorVn: data.sectorVn,
    icbCodeLv2: data.icbCodeLv2,
    icbCodeLv4: data.icbCodeLv4,
    outstandingShares: data.numberOfSharesMktCap,
  };
}

function toOfficers(rows: VciShareholderRow[]): CompanyOfficer[] {
  return rows
    .filter((row) => row.ownerType === 'INDIVIDUAL' && row.positionName)
    .map((row) => ({
      name: row.ownerName,
      position: row.positionName ?? undefined,
      positionEn: row.positionNameEn ?? undefined,
    }));
}

function toShareholders(rows: VciShareholderRow[]): CompanyShareholder[] {
  return rows.map((row) => ({
    name: row.ownerName,
    sharesOwned: row.quantity,
    ownershipPercent: row.percentage != null ? row.percentage * 100 : undefined,
    updatedAt: row.updateDate ? naiveVnTimestampToIso(row.updateDate) : undefined,
  }));
}

/** VCI reports ownership as a fixed set of category percentages/volumes rather than KBS's freeform named rows. */
function toOwnership(structure: VciShareholderStructure): CompanyOwnershipGroup[] {
  const groups: CompanyOwnershipGroup[] = [];
  if (structure.statePercentage != null) {
    groups.push({ ownerType: 'State', sharesOwned: structure.stateVolume, ownershipPercent: structure.statePercentage * 100 });
  }
  if (structure.foreignPercentage != null) {
    groups.push({ ownerType: 'Foreign', sharesOwned: structure.foreignerVolume, ownershipPercent: structure.foreignPercentage * 100 });
  }
  if (structure.otherPercentage != null) {
    groups.push({ ownerType: 'Other', sharesOwned: structure.otherVolume, ownershipPercent: structure.otherPercentage * 100 });
  }
  if (structure.bodPercentage != null) {
    groups.push({ ownerType: 'Board of Directors', ownershipPercent: structure.bodPercentage * 100 });
  }
  if (structure.institutionPercentage != null) {
    groups.push({ ownerType: 'Institution', ownershipPercent: structure.institutionPercentage * 100 });
  }
  return groups;
}

function toSubsidiaries(relationship: VciRelationship): CompanySubsidiary[] {
  return [...(relationship.subsidiaries ?? []), ...(relationship.affiliates ?? [])].map((row) => ({
    name: row.rightOrganNameVi ?? row.rightOrganNameEn ?? '',
    ownershipPercent: row.ownedPercentage != null ? row.ownedPercentage * 100 : undefined,
  }));
}

export interface GetCompanyInfoOptions {
  signal?: AbortSignal;
}

export class VciCompanySource {
  async getCompanyInfo(ticker: string, opts: GetCompanyInfoOptions = {}): Promise<CompanyInfoResult> {
    const symbol = ticker.toUpperCase();

    const [details, shareholderStructure, shareholderList, relationship] = await Promise.all([
      httpGetJson<VciEnvelope<VciCompanyDetails>>(SOURCE, `${BASE_URL}/details?ticker=${symbol}`, {
        headers: VCI_HEADERS,
        signal: opts.signal,
      }),
      httpGetJson<VciEnvelope<VciShareholderStructure>>(SOURCE, `${BASE_URL}/${symbol}/shareholder-structure`, {
        headers: VCI_HEADERS,
        signal: opts.signal,
      }),
      httpGetJson<VciEnvelope<VciShareholderRow[]>>(SOURCE, `${BASE_URL}/${symbol}/shareholder`, {
        headers: VCI_HEADERS,
        signal: opts.signal,
      }),
      httpGetJson<VciEnvelope<VciRelationship>>(SOURCE, `${BASE_URL}/${symbol}/relationship`, {
        headers: VCI_HEADERS,
        signal: opts.signal,
      }),
    ]);

    if (!details.data) {
      throw new SourceParseError(SOURCE, `no company found for "${symbol}"`);
    }

    const shareholderRows = shareholderList.data ?? [];

    return {
      ticker: symbol,
      profile: toProfile(symbol, details.data),
      officers: toOfficers(shareholderRows),
      shareholders: toShareholders(shareholderRows),
      ownership: toOwnership(shareholderStructure.data ?? {}),
      subsidiaries: toSubsidiaries(relationship.data ?? {}),
      capitalHistory: [],
      laborStructure: [],
      fetchedAt: new Date().toISOString(),
      source: 'vci',
      raw: { details: details.data, shareholderStructure: shareholderStructure.data, shareholderList: shareholderRows, relationship: relationship.data },
    };
  }
}
