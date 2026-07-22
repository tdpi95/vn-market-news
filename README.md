# vn-market-news

Aggregates Vietnam stock market news and official disclosures from multiple
sources into one normalized schema, suitable as a feed for analysis /
decision-support AI pipelines.

Sources:

| Source | What it covers | Mechanism | Reliability |
|---|---|---|---|
| **HOSE** (`hose`) | Official listed-company disclosures (Ho Chi Minh Stock Exchange) | `api.hsx.vn` public JSON API + RSS | Confirmed working against the live API |
| **Vietstock** (`vietstock`) | News articles, aggregated from many outlets | Undocumented internal search API + RSS channels | Confirmed working, but unofficial/fragile |
| **CafeF** (`cafef`) | News articles | RSS channels | Confirmed working; no per-ticker feed exists |
| **Google News** (`google-news`) | General news mentioning a ticker/company/keyword | `news.google.com/rss/search` | Stable, well-known format |

HNX (Hanoi Stock Exchange) is intentionally not covered: it has no public
API, its disclosures are mostly bare PDF attachments with little structured
text to extract, and its server has a broken TLS certificate chain that
requires a manual workaround to reach at all — not worth the complexity for
low-value content. You can still add it yourself as a custom `NewsSource`
if you need it (see "Selecting/disabling sources" below).

## Install

```bash
npm install vn-market-news
```

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
  source: 'hose' | 'vietstock' | 'cafef' | 'google-news';
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
  contain false positives/negatives (used for CafeF/Vietstock/Google News
  market-wide feeds, which don't carry structured ticker fields).

Both `NewsItem` and `NewsFeedResult` are exported as Zod schemas
(`NewsItemSchema`, `NewsFeedResultSchema`) if you want runtime validation
somewhere in your pipeline.

### Feeding an LLM

```ts
import { toMarkdownDigest } from 'vn-market-news';

const digest = toMarkdownDigest(market.items);
// paste `digest` straight into a prompt/context window
```

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

## Demo UI

A small local server + browser UI is included under `demo/` for exercising
the library interactively (market news / company news / search, with a
source picker and a limit control) without writing any code.

```bash
npm install
npm run demo   # builds the library, then starts the demo server
```

Then open `http://localhost:4173`. A plain HTML page can't call these
sources directly (none of them send CORS headers), so `demo/server.mjs`
runs `VnMarketNews` server-side and exposes it to the page over same-origin
JSON endpoints (`/api/market`, `/api/company`, `/api/search`) — see
`demo/server.mjs` if you want to reuse that pattern in your own app. Set
`PORT=<port>` to run on a different port.

## Development

```bash
npm install
npm run build       # tsc -> dist/
npm test            # vitest
npm run typecheck
```
