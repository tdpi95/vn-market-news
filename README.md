# vn-market-news

Aggregates Vietnam stock market news, official disclosures, structured
financial statements, and mutual fund data from multiple sources into
normalized schemas, suitable as a feed for analysis/decision-support AI
pipelines.

Sources:

| Source | What it covers | Mechanism | Reliability |
|---|---|---|---|
| **HOSE** (`hose`) | Official listed-company disclosures (Ho Chi Minh Stock Exchange) | `api.hsx.vn` public JSON API + RSS | Confirmed working against the live API |
| **Vietstock** (`vietstock`) | News articles, aggregated from many outlets | Undocumented internal search API + RSS channels | Confirmed working, but unofficial/fragile |
| **CafeF** (`cafef`) | News articles | RSS channels | Confirmed working; no per-ticker feed exists |
| **Google News** (`google-news`) | General news mentioning a ticker/company/keyword | `news.google.com/rss/search` | Stable, well-known format |
| **VnExpress** (`vnexpress`) | Business news | RSS channel | Confirmed working; only a general "kinh-doanh" feed exists, no stock-specific one |
| **Cafebiz** (`cafebiz`) | Business/finance news | RSS channels | Confirmed working; no per-ticker feed exists |
| **VnEconomy** (`vneconomy`) | Stock market/finance news | RSS channels | Confirmed working; no per-ticker feed exists |
| **Diễn Đàn Doanh Nghiệp** (`dddn`) | Business/finance news (VCCI's newspaper) | RSS channels | Confirmed working; no per-ticker feed exists |
| **Znews** (`znews`) | Business/finance news | RSS channel | Confirmed working; only one relevant category feed exists (zingnews.vn now redirects here) |

All of the above except HOSE/Vietstock/Google News have no per-ticker feed
or structured ticker field, so company news is approximated the same way
as CafeF: filtering general-channel titles for ticker mentions
(`tickerConfidence: 'heuristic'`).

HNX (Hanoi Stock Exchange) is intentionally not covered: it has no public
API, its disclosures are mostly bare PDF attachments with little structured
text to extract, and its server has a broken TLS certificate chain that
requires a manual workaround to reach at all — not worth the complexity for
low-value content. You can still add it yourself as a custom `NewsSource`
if you need it (see "Selecting/disabling sources" below).

Thời Báo Kinh Tế Sài Gòn (thesaigontimes.vn) was investigated but isn't
included: every URL on the site returned HTTP 503 across repeated live
attempts, so there was nothing to verify against. It may just be this
environment's network path — feel free to add it yourself if it works for
you.

## Install

This package isn't published to a registry, so pick one of these to use it
from another project:

**`npm link` (recommended while iterating on this library)**

```bash
# in this repo
npm run build
npm link

# in your other project
npm link vn-market-news
```

After editing this repo, just re-run `npm run build` — linked projects pick
up the change immediately, no reinstall needed.

**`file:` dependency (no global state)**

```bash
npm run build   # only dist/ ships, see "files" in package.json
```

Then in the other project's `package.json`:

```json
"dependencies": {
  "vn-market-news": "file:../vn-market-news"
}
```

(or an absolute path), then `npm install`. With older npm this copies files
at install time rather than symlinking, so you'd need to reinstall after
changes.

**`npm pack` (closest to a real published install)**

```bash
npm run build && npm pack   # produces vn-market-news-<version>.tgz
```

Then `npm install /path/to/vn-market-news-<version>.tgz` in the other
project. Useful as a final check that `files: ["dist"]` actually includes
everything needed before publishing for real.

Requires Node.js >= 18.17 (uses native `fetch`).

## Quick start

```ts
import { VnMarketNews } from 'vn-market-news';

const client = new VnMarketNews();

// General market news across all sources
const market = await client.getMarketNews({ limit: 20 });

// News/disclosures for a specific ticker
const hpg = await client.getCompanyNews({ ticker: 'HPG', limit: 20 });

// Free-text search (sources without a search capability are skipped)
const results = await client.search({ keyword: 'lãi suất ngân hàng', limit: 20 });
```

Every call returns a `NewsFeedResult`:

```ts
interface NewsFeedResult {
  generatedAt: string;               // ISO 8601, when this result was assembled
  query: { type: 'market' | 'company' | 'search'; ticker?: string; keyword?: string };
  items: NewsItem[];                 // deduplicated, sorted newest-first
  sourceErrors: { source: SourceName; message: string }[]; // per-source failures, if any
}
```

`sourceErrors` is populated instead of the call throwing — a broken or
rate-limited source degrades the result rather than failing the whole
request. Always check it if completeness matters for your use case.

## The `NewsItem` schema

```ts
interface NewsItem {
  id: string;                     // stable id, safe to use as a dedup/cache key
  source: 'hose' | 'vietstock' | 'cafef' | 'google-news' | 'vnexpress' | 'cafebiz' | 'vneconomy' | 'dddn' | 'znews';
  sourceType: 'official_disclosure' | 'news_article';
  title: string;
  summary?: string;                // plain text, HTML stripped
  url: string;
  publishedAt: string;             // ISO 8601
  fetchedAt: string;               // ISO 8601
  tickers: string[];               // uppercase ticker symbols, e.g. ["HPG"]
  tickerConfidence?: 'declared' | 'query' | 'heuristic';
  companyName?: string;
  category?: string;
  language: 'vi' | 'en';
  originalSource?: string;         // e.g. Vietstock reprints from other outlets
  raw?: unknown;                   // untouched native payload, for debugging/traceability
}
```

`tickerConfidence` tells you *how* a ticker was attached, which matters if
you're feeding this into an AI pipeline that reasons over confidence:

- `declared` — the source itself said so (e.g. HOSE's per-company API, or a
  `TICKER: ...` title prefix).
- `query` — you asked for this ticker specifically (`getCompanyNews`), and
  the source doesn't declare tickers structurally (e.g. Google News), so the
  item is tagged with the ticker you queried for.
- `heuristic` — extracted from free text via regex; lower precision, may
  contain false positives/negatives (used for CafeF/Vietstock/Google News/
  VnExpress/Cafebiz/VnEconomy/Diễn Đàn Doanh Nghiệp/Znews market-wide feeds, none of
  which carry a structured ticker field).

Both `NewsItem` and `NewsFeedResult` are exported as Zod schemas
(`NewsItemSchema`, `NewsFeedResultSchema`) if you want runtime validation
somewhere in your pipeline.

### Feeding an LLM

```ts
import { toMarkdownDigest } from 'vn-market-news';

const digest = toMarkdownDigest(market.items);
// paste `digest` straight into a prompt/context window
```

## Financial statements

Structured balance sheet, income statement, cash flow, and financial ratio
data (not just news about them), sourced from KB Securities Vietnam:

```ts
const balanceSheet = await client.getFinancialStatements('HPG', {
  statementType: 'balance_sheet', // 'balance_sheet' | 'income_statement' | 'cash_flow' | 'ratios' (default: 'balance_sheet')
  period: 'year',                 // 'year' | 'quarter' (default: 'year')
});
```

Returns a `FinancialStatementResult`:

```ts
interface FinancialStatementResult {
  ticker: string;
  statementType: 'balance_sheet' | 'income_statement' | 'cash_flow' | 'ratios';
  periodType: 'year' | 'quarter';
  currency: string;                 // "VND"
  unitScale?: number;                // multiply statement values by this for raw VND (1000); absent for `ratios`
  periods: FinancialPeriod[];        // e.g. [{ label: "2025", year: 2025, consolidated: true, auditStatus: "audited" }, ...]
  items: FinancialLineItem[];        // e.g. { name: "Total assets", nameVi: "...", level: 1, values: { "2025": 123, "2024": 111 } }
  fetchedAt: string;
  source: 'kbs';
}
```

Each `FinancialLineItem.values` is keyed by the matching `FinancialPeriod.label`
(e.g. `"2025"` for annual, `"2025-Q4"` for quarterly), so you can zip
`periods`/`items` together, or just read `values['2025']` directly. Line
items carry both `name` (English) and `nameVi`, plus `level` for
indentation/rollup structure (0 = top-level, e.g. "ASSETS") and `section`
for the report component/ratio category (e.g. "Profitability ratios").

This hits a single source with no fallback, so unlike the news methods
above it throws on failure instead of populating `sourceErrors`.

## Company info

Company profile (business description, registration/contact info,
leadership), officers, major shareholders, ownership breakdown,
subsidiaries/affiliates, charter capital history, and labor structure —
also sourced from KB Securities Vietnam, from the same endpoint as
`getFinancialStatements`:

```ts
const info = await client.getCompanyInfo('HPG');
```

Returns a `CompanyInfoResult`:

```ts
interface CompanyInfoResult {
  ticker: string;
  profile: CompanyProfile;                       // business model, charter capital (raw VND), CEO, contact info, ...
  officers: CompanyOfficer[];                     // board/executive members
  shareholders: CompanyShareholder[];              // named major shareholders
  ownership: CompanyOwnershipGroup[];              // ownership by holder category (staff, foreign, etc.), not by name
  subsidiaries: CompanySubsidiary[];               // ownership > 50% conventionally marks a subsidiary vs. affiliate
  capitalHistory: CompanyCapitalHistoryEntry[];    // charter capital over time
  laborStructure: CompanyLaborStructureEntry[];
  fetchedAt: string;
  source: 'kbs';
}
```

Like `getFinancialStatements`, this hits a single source with no fallback
and throws on failure instead of populating `sourceErrors`.

**`CompanyProfile` has no company name field** — KBS's profile endpoint
only returns the ticker symbol, not the legal/display name. For that, use
`listSymbols`:

```ts
const stocks = await client.listSymbols(); // { type: 'stock' } by default
const hpg = stocks.find((s) => s.symbol === 'HPG');
// { symbol: 'HPG', name: 'CTCP Tập đoàn Hòa Phát', nameEn: 'Hoa Phat Group Joint Stock Company', exchange: 'HOSE', type: 'stock' }

// Or filter server-round-trip-side instead of doing your own .find():
await client.listSymbols({ query: 'hoa phat' }); // case-insensitive substring match on symbol/name/nameEn
```

This is deliberately a separate call rather than something `getCompanyInfo`
fetches for you: the underlying endpoint has no per-ticker filter, so every
call downloads KBS's *entire* market listing (~3,300 symbols across stocks,
funds, bonds, corporate bonds, covered warrants, and futures — pass `type`
to pick one) and filters client-side by `query`/`limit` if given. Cache the
result yourself if you're calling this often; `getCompanyInfo` doesn't do
it for you.

## Mutual funds

Open-end fund data (NAV, top holdings, industry/asset allocation), sourced
from Fmarket, Vietnam's main open-end fund distribution platform:

```ts
const funds = await client.searchFunds('VESAF');           // search/list funds by short name/name
const detail = await client.getFundDetail('VESAF', {
  includeNavHistory: true, // also fetch full NAV history since inception (a separate call)
});
```

`searchFunds` returns `FundSummary[]` (id, short name, NAV, management fee,
manager, and NAV change over several trailing windows). `getFundDetail`
returns a `FundDetailResult`:

```ts
interface FundDetailResult {
  fund: FundSummary;
  topHoldings: FundHolding[];                 // top ~10 positions, stocks and bonds both included
  industryAllocation: FundIndustryAllocation[];
  assetAllocation: FundAssetAllocation[];      // e.g. stocks vs cash split
  navHistory?: FundNavPoint[];                 // only when includeNavHistory is set
  fetchedAt: string;
  source: 'fmarket';
}
```

Like `getFinancialStatements`, this hits a single source with no fallback
and throws on failure instead of populating `sourceErrors`.

## Selecting/disabling sources

```ts
// Only query specific sources for one call
await client.getMarketNews({ sources: ['hose', 'google-news'] });

// Exclude a source at the client level
const client = new VnMarketNews({ disabledSources: ['cafef'] });

// Full control: build your own source list, including custom ones
import { VnMarketNews, defaultSources, HoseSource } from 'vn-market-news';
import type { NewsSource } from 'vn-market-news';

const myCustomSource: NewsSource = { /* implement fetchMarketNews/fetchCompanyNews */ };
const client2 = new VnMarketNews({ sources: [...defaultSources(), myCustomSource] });
```

## Caveats

- **Vietstock's search API (`dc.vietstock.vn`) and CafeF's RSS feeds are
  undocumented.** Both were confirmed live and unauthenticated during
  research, but neither vendor publishes a stable contract — they can change
  shape without notice.
- **CafeF has no per-ticker feed.** Company-specific CafeF results come from
  filtering its general channels for ticker mentions in the title, so
  coverage is approximate, not exhaustive.
- **HOSE's list-endpoint news items don't carry a ticker field directly** —
  tickers are recovered from the conventional `"TICKER: ..."` title prefix,
  or from the ticker you queried by. See `tickerConfidence`.
- **`getFinancialStatements` and `getCompanyInfo` use an undocumented
  internal API** (KB Securities Vietnam's own web-trading backend), not a
  published public API — same "could change without notice" risk as
  Vietstock/CafeF. `getFinancialStatements` also only returns consolidated
  (group-level) figures — there's no confirmed way to request
  standalone/parent-only statements — and the number of periods returned
  isn't controllable (always ~4 most-recent), so build your own history by
  calling repeatedly over time if you need more. `getCompanyInfo`'s officer
  records have a freeform `fromDate` (a start year for most, but a role
  note like "TV Độc lập" for independent board members) rather than a
  parseable date.
- **`searchFunds`/`getFundDetail` also use an undocumented public API**
  (Fmarket's own frontend backend) — genuinely public/unauthenticated, but
  no published contract, so it can change shape without notice.
- **VnExpress, Cafebiz, VnEconomy, Diễn Đàn Doanh Nghiệp, and Znews have no
  per-ticker feed either**, same limitation and same heuristic as CafeF
  above.

## Demo UI

A small local server + browser UI is included under `demo/` for exercising
the library interactively without writing any code — seven tabs: Market
news, Company news, Search, Financials, Company info, Symbols, and Funds
(with a source picker and limit control on the news tabs, statement
type/period selectors on Financials, a type/search-text picker on Symbols,
and a search-then-detail flow with a "View detail →" button per result on
Funds).

```bash
npm install
npm run demo   # builds the library, then starts the demo server
```

Then open `http://localhost:4173`. A plain HTML page can't call these
sources directly (none of them send CORS headers), so `demo/server.mjs`
runs `VnMarketNews` server-side and exposes it to the page over same-origin
JSON endpoints (`/api/market`, `/api/company`, `/api/search`,
`/api/financials`, `/api/company-info`, `/api/symbols`, `/api/funds/search`,
`/api/funds/detail`) — see
`demo/server.mjs` if you want to reuse that pattern in your own app. Set
`PORT=<port>` to run on a different port.

## Development

```bash
npm install
npm run build       # tsc -> dist/
npm test            # vitest
npm run typecheck
```
