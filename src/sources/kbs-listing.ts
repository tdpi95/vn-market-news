import { httpGetJson } from '../lib/http.js';
import type { CompanySymbolListingEntry, CompanySymbolType } from '../company-types.js';

const SOURCE = 'kbs-listing';

/**
 * Market-wide symbol → company name lookup from KB Securities, separate
 * from `KbsCompanySource`'s per-ticker profile (which has no name field at
 * all, only the ticker symbol itself — see `KbsCompanySource`'s doc
 * comment). Confirmed live (2026-07):
 * - The endpoint has no query-param filtering (`?symbol=`, `?q=`, etc. are
 *   all silently ignored) — every call returns the full market listing
 *   (~3,300 rows, ~470KB), so this always fetches the whole thing and
 *   filters client-side. There's no cheaper way to look up one ticker's
 *   name from this API.
 * - Non-stock instrument types (`bond`, `corpbond`, `future`) frequently
 *   have `name`/`nameEn` as `null` — only `stock` and `fund` rows reliably
 *   carry a name, which is why `type` defaults to `'stock'`.
 */
const SEARCH_URL = 'https://kbbuddywts.kbsec.com.vn/iis-server/investment/stock/search/data';

interface KbsSearchRow {
  symbol: string;
  name?: string | null;
  nameEn?: string | null;
  exchange?: string;
  type: string;
}

export interface ListSymbolsOptions {
  /** Restrict to one instrument type. @default 'stock' */
  type?: CompanySymbolType;
  /** Case-insensitive substring match against symbol, name, or nameEn — client-side, since the endpoint ignores query params entirely. */
  query?: string;
  /** Applied after type/query filtering. */
  limit?: number;
  signal?: AbortSignal;
}

export class KbsListingSource {
  async listSymbols(opts: ListSymbolsOptions = {}): Promise<CompanySymbolListingEntry[]> {
    const type = opts.type ?? 'stock';
    const needle = opts.query?.trim().toLowerCase();
    const rows = await httpGetJson<KbsSearchRow[]>(SOURCE, SEARCH_URL, { signal: opts.signal });

    const entries = rows
      .filter((row) => row.type === type)
      .map((row): CompanySymbolListingEntry => ({
        symbol: row.symbol,
        name: row.name ?? undefined,
        nameEn: row.nameEn ?? undefined,
        exchange: row.exchange,
        type: row.type as CompanySymbolType,
      }))
      .filter(
        (entry) =>
          !needle ||
          entry.symbol.toLowerCase().includes(needle) ||
          entry.name?.toLowerCase().includes(needle) ||
          entry.nameEn?.toLowerCase().includes(needle),
      );

    return opts.limit ? entries.slice(0, opts.limit) : entries;
  }
}
