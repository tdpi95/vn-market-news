# vn-market-news

🇬🇧 English · [🇻🇳 Tiếng Việt](#tiếng-việt)

Aggregates Vietnam stock market news, official disclosures, structured
financial statements, and mutual fund data from multiple sources into
normalized schemas, suitable as a feed for analysis/decision-support AI
pipelines.

Sources:

| Source                             | What it covers                                                   | Mechanism                                       | Reliability                                                                                |
| ---------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **HOSE** (`hose`)                  | Official listed-company disclosures (Ho Chi Minh Stock Exchange) | `api.hsx.vn` public JSON API + RSS              | Confirmed working against the live API                                                     |
| **Vietstock** (`vietstock`)        | News articles, aggregated from many outlets                      | Undocumented internal search API + RSS channels | Confirmed working, but unofficial/fragile                                                  |
| **CafeF** (`cafef`)                | News articles                                                    | RSS channels                                    | Confirmed working; no per-ticker feed exists                                               |
| **Google News** (`google-news`)    | General news mentioning a ticker/company/keyword                 | `news.google.com/rss/search`                    | Stable, well-known format                                                                  |
| **VnExpress** (`vnexpress`)        | Business news                                                    | RSS channel                                     | Confirmed working; only a general "kinh-doanh" feed exists, no stock-specific one          |
| **Cafebiz** (`cafebiz`)            | Business/finance news                                            | RSS channels                                    | Confirmed working; no per-ticker feed exists                                               |
| **VnEconomy** (`vneconomy`)        | Stock market/finance news                                        | RSS channels                                    | Confirmed working; no per-ticker feed exists                                               |
| **Diễn Đàn Doanh Nghiệp** (`dddn`) | Business/finance news (VCCI's newspaper)                         | RSS channels                                    | Confirmed working; no per-ticker feed exists                                               |
| **Znews** (`znews`)                | Business/finance news                                            | RSS channel                                     | Confirmed working; only one relevant category feed exists (zingnews.vn now redirects here) |

All of the above except HOSE/Vietstock/Google News have no per-ticker feed
or structured ticker field, so company news is approximated the same way
as CafeF: filtering general-channel titles for ticker mentions
(`tickerConfidence: 'heuristic'`).

## Install

```bash
npm install vn-market-news
```

Requires Node.js >= 18.17 (uses native `fetch`).

### Working against a local checkout

If you're developing this library itself (not just consuming the published
package), pick one of these instead:

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

## Quick start

```ts
import { VnMarketNews } from "vn-market-news";

const client = new VnMarketNews();

// General market news across all sources
const market = await client.getMarketNews({ limit: 20 });

// News/disclosures for a specific ticker. Defaults to hose/vietstock/google-news —
// the only sources with a real per-company query; pass `sources` to widen this.
const hpg = await client.getCompanyNews({ ticker: "HPG", limit: 20 });

// Free-text search (sources without a search capability are skipped)
const results = await client.search({
  keyword: "lãi suất ngân hàng",
  limit: 20,
});
```

Every call returns a `NewsFeedResult`:

```ts
interface NewsFeedResult {
  generatedAt: string; // ISO 8601, when this result was assembled
  query: {
    type: "market" | "company" | "search";
    ticker?: string;
    keyword?: string;
  };
  items: NewsItem[]; // deduplicated, sorted newest-first
  sourceErrors: { source: SourceName; message: string }[]; // per-source failures, if any
}
```

`sourceErrors` is populated instead of the call throwing — a broken or
rate-limited source degrades the result rather than failing the whole
request. Always check it if completeness matters for your use case.

## The `NewsItem` schema

```ts
interface NewsItem {
  id: string; // stable id, safe to use as a dedup/cache key
  source:
    | "hose"
    | "vietstock"
    | "cafef"
    | "google-news"
    | "vnexpress"
    | "cafebiz"
    | "vneconomy"
    | "dddn"
    | "znews";
  sourceType: "official_disclosure" | "news_article";
  title: string;
  summary?: string; // plain text, HTML stripped
  url: string;
  publishedAt: string; // ISO 8601
  fetchedAt: string; // ISO 8601
  tickers: string[]; // uppercase ticker symbols, e.g. ["HPG"]
  tickerConfidence?: "declared" | "query" | "heuristic";
  companyName?: string;
  category?: string;
  language: "vi" | "en";
  originalSource?: string; // e.g. Vietstock reprints from other outlets
  raw?: unknown; // untouched native payload, for debugging/traceability
}
```

`tickerConfidence` tells you _how_ a ticker was attached, which matters if
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
import { toMarkdownDigest } from "vn-market-news";

const digest = toMarkdownDigest(market.items);
// paste `digest` straight into a prompt/context window
```

## Financial statements

Structured balance sheet, income statement, cash flow, and financial ratio
data (not just news about them), sourced from KB Securities Vietnam:

```ts
const balanceSheet = await client.getFinancialStatements("HPG", {
  statementType: "balance_sheet", // 'balance_sheet' | 'income_statement' | 'cash_flow' | 'ratios' (default: 'balance_sheet')
  period: "year", // 'year' | 'quarter' (default: 'year')
});
```

Returns a `FinancialStatementResult`:

```ts
interface FinancialStatementResult {
  ticker: string;
  statementType: "balance_sheet" | "income_statement" | "cash_flow" | "ratios";
  periodType: "year" | "quarter";
  currency: string; // "VND"
  unitScale?: number; // multiply statement values by this for raw VND (1000); absent for `ratios`
  periods: FinancialPeriod[]; // e.g. [{ label: "2025", year: 2025, consolidated: true, auditStatus: "audited" }, ...]
  items: FinancialLineItem[]; // e.g. { name: "Total assets", nameVi: "...", level: 1, values: { "2025": 123, "2024": 111 } }
  fetchedAt: string;
  source: "kbs";
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
const info = await client.getCompanyInfo("HPG");
```

Returns a `CompanyInfoResult`:

```ts
interface CompanyInfoResult {
  ticker: string;
  profile: CompanyProfile; // business model, charter capital (raw VND), CEO, contact info, ...
  officers: CompanyOfficer[]; // board/executive members
  shareholders: CompanyShareholder[]; // named major shareholders
  ownership: CompanyOwnershipGroup[]; // ownership by holder category (staff, foreign, etc.), not by name
  subsidiaries: CompanySubsidiary[]; // ownership > 50% conventionally marks a subsidiary vs. affiliate
  capitalHistory: CompanyCapitalHistoryEntry[]; // charter capital over time
  laborStructure: CompanyLaborStructureEntry[];
  fetchedAt: string;
  source: "kbs";
}
```

Like `getFinancialStatements`, this hits a single source with no fallback
and throws on failure instead of populating `sourceErrors`.

**`CompanyProfile` has no company name field** — KBS's profile endpoint
only returns the ticker symbol, not the legal/display name. For that, use
`listSymbols`:

```ts
const stocks = await client.listSymbols(); // { type: 'stock' } by default
const hpg = stocks.find((s) => s.symbol === "HPG");
// { symbol: 'HPG', name: 'CTCP Tập đoàn Hòa Phát', nameEn: 'Hoa Phat Group Joint Stock Company', exchange: 'HOSE', type: 'stock' }

// Or filter server-round-trip-side instead of doing your own .find():
await client.listSymbols({ query: "hoa phat" }); // case-insensitive substring match on symbol/name/nameEn
```

This is deliberately a separate call rather than something `getCompanyInfo`
fetches for you: the underlying endpoint has no per-ticker filter, so every
call downloads KBS's _entire_ market listing (~3,300 symbols across stocks,
funds, bonds, corporate bonds, covered warrants, and futures — pass `type`
to pick one) and filters client-side by `query`/`limit` if given. Cache the
result yourself if you're calling this often; `getCompanyInfo` doesn't do
it for you.

## Mutual funds

Open-end fund data (NAV, top holdings, industry/asset allocation), sourced
from Fmarket, Vietnam's main open-end fund distribution platform:

```ts
const funds = await client.searchFunds("VESAF"); // search/list funds by short name/name
const detail = await client.getFundDetail("VESAF", {
  includeNavHistory: true, // also fetch full NAV history since inception (a separate call)
});
```

`searchFunds` returns `FundSummary[]` (id, short name, NAV, management fee,
manager, and NAV change over several trailing windows). `getFundDetail`
returns a `FundDetailResult`:

```ts
interface FundDetailResult {
  fund: FundSummary;
  topHoldings: FundHolding[]; // top ~10 positions, stocks and bonds both included
  industryAllocation: FundIndustryAllocation[];
  assetAllocation: FundAssetAllocation[]; // e.g. stocks vs cash split
  navHistory?: FundNavPoint[]; // only when includeNavHistory is set
  fetchedAt: string;
  source: "fmarket";
}
```

Like `getFinancialStatements`, this hits a single source with no fallback
and throws on failure instead of populating `sourceErrors`.

## Selecting/disabling sources

`getCompanyNews` defaults to `hose`/`vietstock`/`google-news` — the only
sources with a real per-company query. cafef/vnexpress/cafebiz/vneconomy/
dddn/znews have no per-ticker feed or search endpoint, so their company
news is a full-channel fetch filtered by a title regex: slow and usually
empty. Pass `sources` explicitly to include one of them anyway.

```ts
// Only query specific sources for one call
await client.getMarketNews({ sources: ["hose", "google-news"] });

// Widen getCompanyNews beyond its default hose/vietstock/google-news set
await client.getCompanyNews({
  ticker: "HPG",
  sources: ["hose", "vietstock", "google-news", "cafef"],
});

// Exclude a source at the client level
const client = new VnMarketNews({ disabledSources: ["cafef"] });

// Full control: build your own source list, including custom ones
import { VnMarketNews, defaultSources, HoseSource } from "vn-market-news";
import type { NewsSource } from "vn-market-news";

const myCustomSource: NewsSource = {
  /* implement fetchMarketNews/fetchCompanyNews */
};
const client2 = new VnMarketNews({
  sources: [...defaultSources(), myCustomSource],
});
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
  above. All six (these five plus CafeF) are excluded from
  `getCompanyNews`'s default source set for this reason — pass `sources`
  explicitly to include one anyway.

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

---

# Tiếng Việt

[🇬🇧 English](#vn-market-news) · 🇻🇳 Tiếng Việt

Tổng hợp tin tức thị trường chứng khoán Việt Nam, công bố thông tin chính
thức, báo cáo tài chính có cấu trúc, và dữ liệu quỹ mở từ nhiều nguồn, chuẩn
hoá về cùng một schema — phù hợp làm nguồn dữ liệu đầu vào cho các pipeline
AI phân tích/hỗ trợ ra quyết định.

Các nguồn dữ liệu:

| Nguồn                              | Phạm vi                                                                             | Cơ chế                                           | Độ tin cậy                                                                                         |
| ---------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **HOSE** (`hose`)                  | Công bố thông tin chính thức của công ty niêm yết (Sở Giao dịch Chứng khoán TP.HCM) | API JSON công khai `api.hsx.vn` + RSS            | Đã xác nhận hoạt động với API thực tế                                                              |
| **Vietstock** (`vietstock`)        | Tin tức tổng hợp từ nhiều báo                                                       | API tìm kiếm nội bộ không công bố + các kênh RSS | Đã xác nhận hoạt động, nhưng không chính thức/dễ thay đổi                                          |
| **CafeF** (`cafef`)                | Tin tức                                                                             | Các kênh RSS                                     | Đã xác nhận hoạt động; không có feed riêng theo mã cổ phiếu                                        |
| **Google News** (`google-news`)    | Tin tức chung có nhắc đến mã cổ phiếu/công ty/từ khoá                               | `news.google.com/rss/search`                     | Ổn định, định dạng phổ biến                                                                        |
| **VnExpress** (`vnexpress`)        | Tin kinh doanh                                                                      | Kênh RSS                                         | Đã xác nhận hoạt động; chỉ có feed chung "kinh-doanh", không có feed riêng theo cổ phiếu           |
| **Cafebiz** (`cafebiz`)            | Tin kinh doanh/tài chính                                                            | Các kênh RSS                                     | Đã xác nhận hoạt động; không có feed riêng theo mã cổ phiếu                                        |
| **VnEconomy** (`vneconomy`)        | Tin thị trường chứng khoán/tài chính                                                | Các kênh RSS                                     | Đã xác nhận hoạt động; không có feed riêng theo mã cổ phiếu                                        |
| **Diễn Đàn Doanh Nghiệp** (`dddn`) | Tin kinh doanh/tài chính (báo của VCCI)                                             | Các kênh RSS                                     | Đã xác nhận hoạt động; không có feed riêng theo mã cổ phiếu                                        |
| **Znews** (`znews`)                | Tin kinh doanh/tài chính                                                            | Kênh RSS                                         | Đã xác nhận hoạt động; chỉ có một kênh chuyên mục liên quan (zingnews.vn hiện chuyển hướng về đây) |

Tất cả các nguồn trên trừ HOSE/Vietstock/Google News đều không có feed riêng
theo mã cổ phiếu hay trường mã cổ phiếu có cấu trúc, nên tin theo công ty
được suy ra bằng cách lọc tiêu đề trong các kênh chung để tìm mã cổ phiếu
được nhắc đến (`tickerConfidence: 'heuristic'`).

## Cài đặt

```bash
npm install vn-market-news
```

Yêu cầu Node.js >= 18.17 (dùng `fetch` có sẵn của Node).

### Làm việc trực tiếp trên bản checkout cục bộ

Nếu bạn đang phát triển chính thư viện này (không chỉ dùng bản đã publish),
hãy chọn một trong các cách sau:

**`npm link` (khuyến nghị khi đang chỉnh sửa thư viện này)**

```bash
# trong repo này
npm run build
npm link

# trong project khác của bạn
npm link vn-market-news
```

Sau khi sửa repo này, chỉ cần chạy lại `npm run build` — các project đã
link sẽ nhận thay đổi ngay lập tức, không cần cài lại.

**Dùng dependency dạng `file:` (không cần trạng thái global)**

```bash
npm run build   # chỉ dist/ được đóng gói, xem "files" trong package.json
```

Sau đó trong `package.json` của project khác:

```json
"dependencies": {
  "vn-market-news": "file:../vn-market-news"
}
```

(hoặc dùng đường dẫn tuyệt đối), rồi chạy `npm install`. Với npm phiên bản
cũ, cách này copy file tại thời điểm cài đặt thay vì symlink, nên bạn sẽ
cần cài lại mỗi khi có thay đổi.

**`npm pack` (gần giống nhất với cài đặt từ bản publish thật)**

```bash
npm run build && npm pack   # tạo ra file vn-market-news-<version>.tgz
```

Sau đó chạy `npm install /path/to/vn-market-news-<version>.tgz` ở project
khác. Hữu ích để kiểm tra lần cuối rằng `files: ["dist"]` đã bao gồm đầy đủ
mọi thứ cần thiết trước khi publish thật.

## Bắt đầu nhanh

```ts
import { VnMarketNews } from "vn-market-news";

const client = new VnMarketNews();

// Tin tức thị trường chung, tổng hợp từ mọi nguồn
const market = await client.getMarketNews({ limit: 20 });

// Tin tức/công bố thông tin theo mã cổ phiếu. Mặc định dùng hose/vietstock/google-news —
// đây là các nguồn duy nhất có truy vấn thật theo từng công ty; truyền `sources` để mở rộng.
const hpg = await client.getCompanyNews({ ticker: "HPG", limit: 20 });

// Tìm kiếm tự do theo từ khoá (nguồn không hỗ trợ search sẽ tự động bị bỏ qua)
const results = await client.search({
  keyword: "lãi suất ngân hàng",
  limit: 20,
});
```

Mỗi lệnh gọi đều trả về một `NewsFeedResult`:

```ts
interface NewsFeedResult {
  generatedAt: string; // ISO 8601, thời điểm kết quả này được tạo ra
  query: {
    type: "market" | "company" | "search";
    ticker?: string;
    keyword?: string;
  };
  items: NewsItem[]; // đã loại trùng, sắp xếp mới nhất trước
  sourceErrors: { source: SourceName; message: string }[]; // lỗi theo từng nguồn, nếu có
}
```

`sourceErrors` được điền vào thay vì làm lệnh gọi ném lỗi — một nguồn bị
lỗi hoặc bị giới hạn tần suất chỉ làm giảm chất lượng kết quả chứ không làm
hỏng toàn bộ request. Luôn kiểm tra trường này nếu tính đầy đủ của dữ liệu
quan trọng với use case của bạn.

## Schema `NewsItem`

```ts
interface NewsItem {
  id: string; // id ổn định, dùng an toàn làm khoá dedup/cache
  source:
    | "hose"
    | "vietstock"
    | "cafef"
    | "google-news"
    | "vnexpress"
    | "cafebiz"
    | "vneconomy"
    | "dddn"
    | "znews";
  sourceType: "official_disclosure" | "news_article";
  title: string;
  summary?: string; // văn bản thuần, đã loại bỏ HTML
  url: string;
  publishedAt: string; // ISO 8601
  fetchedAt: string; // ISO 8601
  tickers: string[]; // mã cổ phiếu viết hoa, ví dụ ["HPG"]
  tickerConfidence?: "declared" | "query" | "heuristic";
  companyName?: string;
  category?: string;
  language: "vi" | "en";
  originalSource?: string; // ví dụ: Vietstock đăng lại từ báo khác
  raw?: unknown; // dữ liệu gốc chưa xử lý, phục vụ debug/truy vết
}
```

`tickerConfidence` cho biết mã cổ phiếu được gắn vào _bằng cách nào_ — điều
này quan trọng nếu bạn đưa dữ liệu này vào một pipeline AI có suy luận theo
độ tin cậy:

- `declared` — chính nguồn dữ liệu khai báo rõ (ví dụ: API theo công ty của
  HOSE, hoặc tiêu đề có tiền tố `MÃ: ...`).
- `query` — bạn hỏi đích danh mã cổ phiếu này (`getCompanyNews`), và nguồn
  dữ liệu không khai báo mã cổ phiếu có cấu trúc (ví dụ Google News), nên
  mục tin được gắn mã cổ phiếu mà bạn đã truy vấn.
- `heuristic` — trích xuất từ văn bản tự do bằng regex, độ chính xác thấp
  hơn, có thể có sai sót dương tính/âm tính giả (dùng cho các feed thị
  trường chung của CafeF/Vietstock/Google News/VnExpress/Cafebiz/VnEconomy/
  Diễn Đàn Doanh Nghiệp/Znews, vì không nguồn nào trong số đó có trường mã
  cổ phiếu có cấu trúc).

Cả `NewsItem` và `NewsFeedResult` đều được export dưới dạng Zod schema
(`NewsItemSchema`, `NewsFeedResultSchema`) nếu bạn muốn validate ở runtime
tại một điểm nào đó trong pipeline của mình.

### Đưa dữ liệu vào LLM

```ts
import { toMarkdownDigest } from "vn-market-news";

const digest = toMarkdownDigest(market.items);
// dán thẳng `digest` vào prompt/context window
```

## Báo cáo tài chính

Dữ liệu bảng cân đối kế toán, báo cáo kết quả kinh doanh, lưu chuyển tiền
tệ, và chỉ số tài chính có cấu trúc (không chỉ là tin tức về chúng), lấy từ
Chứng khoán KB Việt Nam:

```ts
const balanceSheet = await client.getFinancialStatements("HPG", {
  statementType: "balance_sheet", // 'balance_sheet' | 'income_statement' | 'cash_flow' | 'ratios' (mặc định: 'balance_sheet')
  period: "year", // 'year' | 'quarter' (mặc định: 'year')
});
```

Trả về một `FinancialStatementResult`:

```ts
interface FinancialStatementResult {
  ticker: string;
  statementType: "balance_sheet" | "income_statement" | "cash_flow" | "ratios";
  periodType: "year" | "quarter";
  currency: string; // "VND"
  unitScale?: number; // nhân giá trị báo cáo với số này để ra VND thô (1000); không có với `ratios`
  periods: FinancialPeriod[]; // ví dụ [{ label: "2025", year: 2025, consolidated: true, auditStatus: "audited" }, ...]
  items: FinancialLineItem[]; // ví dụ { name: "Total assets", nameVi: "...", level: 1, values: { "2025": 123, "2024": 111 } }
  fetchedAt: string;
  source: "kbs";
}
```

Mỗi `FinancialLineItem.values` được đánh khoá theo `FinancialPeriod.label`
tương ứng (ví dụ `"2025"` cho báo cáo năm, `"2025-Q4"` cho báo cáo quý), nên
bạn có thể ghép `periods`/`items` với nhau, hoặc đọc thẳng `values['2025']`.
Mỗi dòng chỉ tiêu có cả `name` (tiếng Anh) và `nameVi`, cùng `level` để thể
hiện cấu trúc thụt lề/tổng hợp (0 = cấp cao nhất, ví dụ "ASSETS") và
`section` cho phần báo cáo/nhóm chỉ số (ví dụ "Profitability ratios").

Hàm này chỉ gọi một nguồn duy nhất, không có phương án dự phòng, nên khác
với các hàm tin tức ở trên, nó sẽ ném lỗi (throw) khi thất bại thay vì điền
vào `sourceErrors`.

## Thông tin doanh nghiệp

Hồ sơ công ty (mô tả hoạt động kinh doanh, thông tin đăng ký/liên hệ, ban
lãnh đạo), danh sách lãnh đạo, cổ đông lớn, cơ cấu sở hữu, công ty
con/liên kết, lịch sử vốn điều lệ, và cơ cấu lao động — cũng lấy từ Chứng
khoán KB Việt Nam, từ cùng endpoint với `getFinancialStatements`:

```ts
const info = await client.getCompanyInfo("HPG");
```

Trả về một `CompanyInfoResult`:

```ts
interface CompanyInfoResult {
  ticker: string;
  profile: CompanyProfile; // mô hình kinh doanh, vốn điều lệ (VND thô), CEO, thông tin liên hệ, ...
  officers: CompanyOfficer[]; // thành viên HĐQT/ban điều hành
  shareholders: CompanyShareholder[]; // cổ đông lớn có tên cụ thể
  ownership: CompanyOwnershipGroup[]; // sở hữu theo nhóm (nhân viên, nước ngoài, ...), không theo tên
  subsidiaries: CompanySubsidiary[]; // sở hữu > 50% được quy ước tính là công ty con, dưới mức đó là liên kết
  capitalHistory: CompanyCapitalHistoryEntry[]; // lịch sử vốn điều lệ theo thời gian
  laborStructure: CompanyLaborStructureEntry[];
  fetchedAt: string;
  source: "kbs";
}
```

Giống `getFinancialStatements`, hàm này chỉ gọi một nguồn duy nhất, không
có phương án dự phòng, và sẽ ném lỗi khi thất bại thay vì điền vào
`sourceErrors`.

**`CompanyProfile` không có trường tên công ty** — endpoint hồ sơ của KBS
chỉ trả về mã cổ phiếu, không có tên pháp nhân/tên hiển thị. Để lấy tên,
dùng `listSymbols`:

```ts
const stocks = await client.listSymbols(); // mặc định { type: 'stock' }
const hpg = stocks.find((s) => s.symbol === "HPG");
// { symbol: 'HPG', name: 'CTCP Tập đoàn Hòa Phát', nameEn: 'Hoa Phat Group Joint Stock Company', exchange: 'HOSE', type: 'stock' }

// Hoặc lọc ngay phía server thay vì tự .find():
await client.listSymbols({ query: "hoa phat" }); // khớp chuỗi con, không phân biệt hoa/thường, trên symbol/name/nameEn
```

Đây cố tình là một lệnh gọi tách riêng thay vì để `getCompanyInfo` tự lấy
giúp: endpoint gốc không có bộ lọc theo mã cổ phiếu, nên mỗi lần gọi sẽ tải
về _toàn bộ_ danh mục niêm yết của KBS (~3.300 mã, gồm cổ phiếu, quỹ, trái
phiếu, trái phiếu doanh nghiệp, chứng quyền, và hợp đồng tương lai — truyền
`type` để chọn một loại) rồi lọc ở phía client theo `query`/`limit` nếu có.
Hãy tự cache kết quả nếu bạn gọi hàm này thường xuyên; `getCompanyInfo`
không tự làm việc đó cho bạn.

## Quỹ mở

Dữ liệu quỹ mở (NAV, danh mục nắm giữ hàng đầu, phân bổ theo ngành/loại tài
sản), lấy từ Fmarket — nền tảng phân phối quỹ mở chính của Việt Nam:

```ts
const funds = await client.searchFunds("VESAF"); // tìm/liệt kê quỹ theo tên viết tắt/tên đầy đủ
const detail = await client.getFundDetail("VESAF", {
  includeNavHistory: true, // lấy thêm toàn bộ lịch sử NAV từ khi thành lập (một lệnh gọi riêng)
});
```

`searchFunds` trả về `FundSummary[]` (id, tên viết tắt, NAV, phí quản lý,
công ty quản lý, và biến động NAV theo vài khung thời gian gần nhất).
`getFundDetail` trả về một `FundDetailResult`:

```ts
interface FundDetailResult {
  fund: FundSummary;
  topHoldings: FundHolding[]; // top ~10 vị thế, gồm cả cổ phiếu và trái phiếu
  industryAllocation: FundIndustryAllocation[];
  assetAllocation: FundAssetAllocation[]; // ví dụ tỷ trọng cổ phiếu so với tiền mặt
  navHistory?: FundNavPoint[]; // chỉ có khi bật includeNavHistory
  fetchedAt: string;
  source: "fmarket";
}
```

Giống `getFinancialStatements`, hàm này chỉ gọi một nguồn duy nhất, không
có phương án dự phòng, và sẽ ném lỗi khi thất bại thay vì điền vào
`sourceErrors`.

## Chọn/tắt nguồn dữ liệu

`getCompanyNews` mặc định chỉ dùng `hose`/`vietstock`/`google-news` — đây
là các nguồn duy nhất có truy vấn thật theo từng công ty. Các nguồn
cafef/vnexpress/cafebiz/vneconomy/dddn/znews không có feed riêng theo mã cổ
phiếu hay endpoint tìm kiếm, nên tin theo công ty của chúng phải tải toàn
bộ kênh rồi lọc bằng regex theo tiêu đề: chậm và thường không ra kết quả.
Truyền `sources` để chủ động thêm một trong các nguồn này nếu vẫn muốn dùng.

```ts
// Chỉ truy vấn các nguồn cụ thể cho một lệnh gọi
await client.getMarketNews({ sources: ["hose", "google-news"] });

// Mở rộng getCompanyNews ra ngoài bộ mặc định hose/vietstock/google-news
await client.getCompanyNews({
  ticker: "HPG",
  sources: ["hose", "vietstock", "google-news", "cafef"],
});

// Loại bỏ một nguồn ở mức client
const client = new VnMarketNews({ disabledSources: ["cafef"] });

// Toàn quyền kiểm soát: tự xây danh sách nguồn, kể cả nguồn tuỳ chỉnh
import { VnMarketNews, defaultSources, HoseSource } from "vn-market-news";
import type { NewsSource } from "vn-market-news";

const myCustomSource: NewsSource = {
  /* triển khai fetchMarketNews/fetchCompanyNews */
};
const client2 = new VnMarketNews({
  sources: [...defaultSources(), myCustomSource],
});
```

## Lưu ý

- **API tìm kiếm của Vietstock (`dc.vietstock.vn`) và feed RSS của CafeF
  đều không được công bố chính thức.** Cả hai đã được xác nhận hoạt động
  và không cần xác thực trong quá trình nghiên cứu, nhưng nhà cung cấp
  không công bố hợp đồng ổn định nào — có thể thay đổi cấu trúc bất cứ lúc
  nào mà không báo trước.
- **CafeF không có feed riêng theo mã cổ phiếu.** Kết quả theo công ty của
  CafeF đến từ việc lọc các kênh chung để tìm mã cổ phiếu được nhắc trong
  tiêu đề, nên độ bao phủ chỉ mang tính tương đối, không đầy đủ.
- **Các mục tin từ endpoint danh sách của HOSE không mang trường mã cổ
  phiếu trực tiếp** — mã cổ phiếu được khôi phục từ tiền tố tiêu đề dạng
  quy ước `"MÃ: ..."`, hoặc từ mã bạn đã truy vấn. Xem `tickerConfidence`.
- **`getFinancialStatements` và `getCompanyInfo` dùng một API nội bộ không
  công bố** (chính là backend giao dịch trực tuyến của Chứng khoán KB Việt
  Nam), không phải API công khai chính thức — cùng rủi ro "có thể thay đổi
  bất cứ lúc nào mà không báo trước" như Vietstock/CafeF. `getFinancialStatements`
  cũng chỉ trả về số liệu hợp nhất (consolidated) — chưa xác nhận được cách
  nào để lấy báo cáo riêng lẻ (công ty mẹ) — và số kỳ báo cáo trả về không
  điều chỉnh được (luôn ~4 kỳ gần nhất), nên nếu cần lịch sử dài hơn, bạn
  cần tự xây dựng bằng cách gọi lặp lại theo thời gian. Trường `fromDate`
  của các bản ghi lãnh đạo trong `getCompanyInfo` có định dạng tự do (năm
  bắt đầu với hầu hết trường hợp, nhưng là ghi chú vai trò như "TV Độc lập"
  với thành viên HĐQT độc lập) thay vì một định dạng ngày có thể parse được.
- **`searchFunds`/`getFundDetail` cũng dùng một API công khai không công
  bố chính thức** (backend frontend của chính Fmarket) — thực sự công khai
  và không cần xác thực, nhưng không có hợp đồng được công bố, nên có thể
  thay đổi cấu trúc bất cứ lúc nào mà không báo trước.
- **VnExpress, Cafebiz, VnEconomy, Diễn Đàn Doanh Nghiệp, và Znews cũng
  không có feed riêng theo mã cổ phiếu**, cùng hạn chế và cùng cách suy
  luận (heuristic) như CafeF ở trên. Cả sáu nguồn này (năm nguồn kể trên
  cộng CafeF) đều bị loại khỏi bộ nguồn mặc định của `getCompanyNews` vì lý
  do đó — truyền `sources` để chủ động thêm vào nếu cần.

## Giao diện Demo

Kèm theo một server cục bộ nhỏ + giao diện trình duyệt trong thư mục `demo/`
để thử nghiệm thư viện một cách trực quan mà không cần viết code — bảy tab:
Market news, Company news, Search, Financials, Company info, Symbols, và
Funds (có bộ chọn nguồn và giới hạn số lượng ở các tab tin tức, bộ chọn
loại báo cáo/kỳ ở tab Financials, bộ chọn loại/ô tìm kiếm ở tab Symbols, và
luồng tìm-rồi-xem-chi-tiết với nút "View detail →" cho mỗi kết quả ở tab
Funds).

```bash
npm install
npm run demo   # build thư viện rồi khởi động demo server
```

Sau đó mở `http://localhost:4173`. Một trang HTML thuần không thể gọi
thẳng các nguồn dữ liệu này (không nguồn nào gửi CORS header), nên
`demo/server.mjs` chạy `VnMarketNews` ở phía server và expose ra cho trang
qua các endpoint JSON cùng-origin (`/api/market`, `/api/company`,
`/api/search`, `/api/financials`, `/api/company-info`, `/api/symbols`,
`/api/funds/search`, `/api/funds/detail`) — xem `demo/server.mjs` nếu bạn
muốn tái sử dụng cách làm này trong app của mình. Đặt biến môi trường
`PORT=<port>` để chạy ở cổng khác.

## Phát triển

```bash
npm install
npm run build       # tsc -> dist/
npm test            # vitest
npm run typecheck
```
