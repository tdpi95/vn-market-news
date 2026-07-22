---
name: vn-market-news
description: Use when the user wants to fetch, aggregate, or analyze Vietnam stock market news and official disclosures (HOSE, Vietstock, CafeF, Google News) programmatically, wants a normalized feed for an AI/analysis pipeline, or is working on/extending the vn-market-news library itself (adding a source, fixing an adapter, running its tests or demo).
---

# vn-market-news

TypeScript library that aggregates Vietnam stock market news/disclosures
into one normalized schema. Source lives in `src/`, published as an npm
package (`vn-market-news`), Node.js >= 18.17 (uses native `fetch`).

Full reference: `README.md` in this repo. This skill is the fast path —
read the README before assuming more detail is needed than is here.

## Sources (4, all confirmed working live)

| Source | Covers | Mechanism |
|---|---|---|
| `hose` | Official HOSE listed-company disclosures | `api.hsx.vn` JSON API + RSS |
| `vietstock` | News articles from many outlets | Undocumented `dc.vietstock.vn` search API + RSS |
| `cafef` | News articles | RSS channels (no per-ticker feed) |
| `google-news` | General news by ticker/company/keyword | `news.google.com/rss/search` |

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
text, lower precision — used for CafeF/Vietstock/Google News market-wide
feeds). Don't treat `heuristic` tickers as ground truth in analysis.

For LLM context/prompts, use `toMarkdownDigest(items)` rather than hand
rolling formatting.

Select/exclude sources with `{ sources: [...] }` per-call or
`new VnMarketNews({ disabledSources: [...] })` at the client level. Add a
custom source by implementing the `NewsSource` interface
(`fetchMarketNews`, `fetchCompanyNews`, optional `search`) and passing
`{ sources: [...defaultSources(), myCustomSource] }`.

## Working on the library itself

- One file per source adapter under `src/sources/`; shared HTTP/RSS/text
  helpers in `src/lib/`; aggregation logic in `src/client.ts`; schemas in
  `src/types.ts` (Zod).
- `src/sources/cafef.ts` is the template for a new RSS-only, no-ticker-field
  source (heuristic ticker extraction + channel list). `src/sources/hose.ts`
  is the template for a source with a real JSON API and per-company
  resolution.
- **Before trusting an assumption about an undocumented endpoint's response
  shape, verify it live** (curl/fetch it) rather than guessing — this
  codebase has already been bitten twice by confidently-wrong assumptions
  about response wrappers and URL patterns that only surfaced once tested
  against the real site. Don't repeat that: test adapter changes against
  the live source before considering them done.
- Commands: `npm run build` (tsc → `dist/`), `npm test` (vitest),
  `npm run typecheck`.
- `npm run demo` builds and starts a local server+UI at
  `http://localhost:4173` for manually exercising `getMarketNews` /
  `getCompanyNews` / `search` in a browser — use this to sanity-check a
  change beyond unit tests. See `demo/server.mjs` (plain `node:http`, no
  framework) and `demo/index.html`.
