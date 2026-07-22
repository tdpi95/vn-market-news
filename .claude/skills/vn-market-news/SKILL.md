---
name: vn-market-news
description: Use when the user wants to fetch, aggregate, or analyze Vietnam stock market news, official disclosures, structured financial statements, or open-end mutual fund data (HOSE, Vietstock, CafeF, Google News, KB Securities, Fmarket) programmatically, wants a normalized feed for an AI/analysis pipeline, or is working on/extending the vn-market-news library itself (adding a source, fixing an adapter, running its tests or demo).
---

# vn-market-news

TypeScript library that aggregates Vietnam stock market news/disclosures,
structured financial statements, and mutual fund data into normalized
schemas. Source lives in `src/`, published as an npm package
(`vn-market-news`), Node.js >= 18.17 (uses native `fetch`).

Full reference: `README.md` in this repo. This skill is the fast path —
read the README before assuming more detail is needed than is here.

## Sources (9)

| Source | Covers | Mechanism |
|---|---|---|
| `hose` | Official HOSE listed-company disclosures | `api.hsx.vn` JSON API + RSS |
| `vietstock` | News articles from many outlets | Undocumented `dc.vietstock.vn` search API + RSS |
| `cafef` | News articles | RSS channels (no per-ticker feed) |
| `google-news` | General news by ticker/company/keyword | `news.google.com/rss/search` |
| `vnexpress` | Business news | RSS channel (no per-ticker feed) |
| `cafebiz` | Business/finance news | RSS channels (no per-ticker feed) |
| `vneconomy` | Stock market/finance news | RSS channels (no per-ticker feed) |
| `dddn` | Business/finance news (VCCI's newspaper, Diễn Đàn Doanh Nghiệp) | RSS channels (no per-ticker feed) |
| `znews` | Business/finance news | RSS channel (no per-ticker feed) |

`vnexpress`/`cafebiz`/`vneconomy`/`dddn`/`znews` all share one
implementation, `createRssNewsSource(name, channels)` in
`src/lib/rss-source.ts` — same pattern as `cafef.ts` (heuristic ticker
extraction from titles, no structured ticker field). Each source's own
file (`src/sources/vnexpress.ts` etc.) just declares its verified channel
URLs and calls the factory; add a new RSS-only outlet the same way rather
than hand-rolling another class. `cafef.ts` predates the factory and is
still its own class — leave it as-is unless asked to refactor.

Known live-verification findings (2026-07-22, may drift over time): Báo
Đầu Tư (`baodautu`) was tried and then removed — its RSS feeds (every
category, including its own homepage feed) were returning zero `<item>`
entries despite correct URLs, likely a temporary outage on their end;
replaced by `dddn`. Thời Báo Kinh Tế Sài Gòn (thesaigontimes.vn) was
investigated and NOT added — every URL 503'd across repeated attempts,
possibly specific to this environment's network path.

HNX is deliberately NOT included (no public API, mostly PDF-only content,
broken TLS chain server-side) — don't re-add it without the user asking.

## Using it as a consumer

```ts
import { VnMarketNews } from 'vn-market-news';

const client = new VnMarketNews();
const market = await client.getMarketNews({ limit: 20 });               // general market news
const company = await client.getCompanyNews({ ticker: 'HPG', limit: 20 }); // by ticker
const results = await client.search({ keyword: 'lãi suất ngân hàng' });  // free text (skips sources without search())
```

Every call returns `{ generatedAt, query, items: NewsItem[], sourceErrors }`.
**Always check `sourceErrors`** — a broken/rate-limited source degrades the
result instead of throwing, so silently ignoring it can hide partial data.

`NewsItem.tickerConfidence` matters for anything AI/decision-support facing:
`declared` (source said so structurally) > `query` (tagged because the
caller asked for this exact ticker) > `heuristic` (regex-extracted from free
text, lower precision — used for every RSS-only source plus Vietstock/
Google News market-wide feeds, none of which carry a structured ticker
field). Don't treat `heuristic` tickers as ground truth in analysis.

For LLM context/prompts, use `toMarkdownDigest(items)` rather than hand
rolling formatting.

Select/exclude sources with `{ sources: [...] }` per-call or
`new VnMarketNews({ disabledSources: [...] })` at the client level. Add a
custom source by implementing the `NewsSource` interface
(`fetchMarketNews`, `fetchCompanyNews`, optional `search`) and passing
`{ sources: [...defaultSources(), myCustomSource] }`.

### Financial statements (structured, not news)

```ts
const bs = await client.getFinancialStatements('HPG', { statementType: 'balance_sheet', period: 'year' });
```

Separate from the news methods — returns a `FinancialStatementResult`
(periods × labeled line items with EN/VI names, from KB Securities' internal
API), throws on failure instead of populating `sourceErrors` (single
source, no fallback). `statementType`: `balance_sheet` | `income_statement`
| `cash_flow` | `ratios`. See `src/sources/kbs-finance.ts` for the mapping
logic and known quirks (naive Vietnam-local timestamps, duplicate period
rows, consolidated-only, ~4 periods max).

### Mutual funds (structured, not news)

```ts
const funds = await client.searchFunds('VESAF');
const detail = await client.getFundDetail('VESAF', { includeNavHistory: true });
```

Open-end fund NAV/holdings/allocation from Fmarket, sourced via
`FmarketFundSource` (`src/sources/fmarket-fund.ts`). Unlike the KBS/HOSE
APIs, this one is genuinely public/unauthenticated (also used by vnstock's
open-source `explorer.fmarket` module, not just its paid tier) — but still
undocumented. `getFundDetail` resolves a short name (e.g. "VESAF") to
Fmarket's internal fund id via a search call first, then fetches detail;
`includeNavHistory` triggers a second, heavier call for full NAV history
since inception. Throws on failure, same as `getFinancialStatements`.

## Working on the library itself

- One file per source adapter under `src/sources/`; shared HTTP/RSS/text
  helpers in `src/lib/`; aggregation logic in `src/client.ts`; schemas in
  `src/types.ts` (Zod).
- For a new RSS-only, no-ticker-field source, use `createRssNewsSource`
  from `src/lib/rss-source.ts` (see `src/sources/vnexpress.ts` for the
  shortest example) rather than hand-rolling another class. `src/sources/
  hose.ts` is the template for a source with a real JSON API and
  per-company resolution.
- **Before trusting an assumption about an undocumented endpoint's response
  shape, verify it live** (curl/fetch it) rather than guessing — this
  codebase has already been bitten twice by confidently-wrong assumptions
  about response wrappers and URL patterns that only surfaced once tested
  against the real site. Don't repeat that: test adapter changes against
  the live source before considering them done.
- Commands: `npm run build` (tsc → `dist/`), `npm test` (vitest),
  `npm run typecheck`.
- `npm run demo` builds and starts a local server+UI at
  `http://localhost:4173` for manually exercising every public method
  (`getMarketNews`/`getCompanyNews`/`search`, `getFinancialStatements`,
  `searchFunds`/`getFundDetail`) in a browser via five tabs — use this to
  sanity-check a change beyond unit tests. See `demo/server.mjs` (plain
  `node:http`, no framework, one `/api/*` route per client method) and
  `demo/index.html`. When adding a new client method, add its route to
  `demo/server.mjs` and a tab/renderer to `demo/index.html` too.
