import { createHash } from 'node:crypto';
import type { NewsItem } from '../types.js';

const HTML_TAG_RE = /<[^>]*>/g;
const ENTITY_MAP: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&nbsp;': ' ',
  '&ndash;': '-',
  '&mdash;': '-',
  '&hellip;': '...',
  '&lsquo;': '‘',
  '&rsquo;': '’',
  '&ldquo;': '“',
  '&rdquo;': '”',
  // Latin-1 accented letters — some sources (e.g. VCI's company profile
  // HTML) entity-encode only the subset of Vietnamese characters that
  // happen to have a classic HTML4/Latin-1 named entity, leaving every
  // other diacritic (ư, ơ, ă, đ, and combining-tone-mark letters) as raw
  // UTF-8, so this table only needs to cover the Latin-1 supplement.
  '&Agrave;': 'À', '&Aacute;': 'Á', '&Acirc;': 'Â', '&Atilde;': 'Ã', '&Auml;': 'Ä', '&Aring;': 'Å',
  '&agrave;': 'à', '&aacute;': 'á', '&acirc;': 'â', '&atilde;': 'ã', '&auml;': 'ä', '&aring;': 'å',
  '&Egrave;': 'È', '&Eacute;': 'É', '&Ecirc;': 'Ê', '&Euml;': 'Ë',
  '&egrave;': 'è', '&eacute;': 'é', '&ecirc;': 'ê', '&euml;': 'ë',
  '&Igrave;': 'Ì', '&Iacute;': 'Í', '&Icirc;': 'Î', '&Iuml;': 'Ï',
  '&igrave;': 'ì', '&iacute;': 'í', '&icirc;': 'î', '&iuml;': 'ï',
  '&Ograve;': 'Ò', '&Oacute;': 'Ó', '&Ocirc;': 'Ô', '&Otilde;': 'Õ', '&Ouml;': 'Ö',
  '&ograve;': 'ò', '&oacute;': 'ó', '&ocirc;': 'ô', '&otilde;': 'õ', '&ouml;': 'ö',
  '&Ugrave;': 'Ù', '&Uacute;': 'Ú', '&Ucirc;': 'Û', '&Uuml;': 'Ü',
  '&ugrave;': 'ù', '&uacute;': 'ú', '&ucirc;': 'û', '&uuml;': 'ü',
  '&Yacute;': 'Ý', '&yacute;': 'ý', '&yuml;': 'ÿ',
  '&Ccedil;': 'Ç', '&ccedil;': 'ç', '&Ntilde;': 'Ñ', '&ntilde;': 'ñ',
};

export function stripHtml(input: string | undefined): string | undefined {
  if (!input) return input;
  const withoutTags = input.replace(HTML_TAG_RE, ' ');
  const withoutNumericEntities = withoutTags
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  const decoded = withoutNumericEntities.replace(/&[a-z]+;/gi, (m) => ENTITY_MAP[m] ?? m);
  return normalizeWhitespace(decoded);
}

export function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, ' ').trim();
}

/** Deterministic id so re-fetching the same item doesn't create duplicates downstream. */
export function stableId(...parts: string[]): string {
  return createHash('sha1').update(parts.join('|')).digest('hex').slice(0, 16);
}

/**
 * Best-effort ticker extraction from free text (title/summary) for sources
 * that don't declare tickers structurally. Matches bare 3-4 letter uppercase
 * tokens, optionally restricted to a known ticker allowlist to cut down on
 * false positives (acronyms like "CEO", "GDP", "IPO" would otherwise match).
 */
const TICKER_TOKEN_RE = /\b[A-Z]{3,4}\b/g;
const COMMON_NON_TICKER_ACRONYMS = new Set([
  'CEO', 'CFO', 'CTO', 'GDP', 'IPO', 'ETF', 'USD', 'VND', 'EUR',
  'ADB', 'IMF', 'WTO', 'FED', 'SSC', 'HOSE', 'HNX', 'UPCOM', 'ROE', 'ROA',
  'EPS', 'PER', 'PEG', 'NAV', 'ESG', 'FDI', 'GDP', 'CPI', 'PMI',
]);

const TICKER_PREFIX_RE = /^([A-Z]{2,4}):\s*/;

/** Vietnamese exchange/news titles are conventionally prefixed "TICKER: ...". */
export function extractLeadingTicker(title: string): string | undefined {
  return title.match(TICKER_PREFIX_RE)?.[1];
}

export function extractTickers(text: string, knownTickers?: Set<string>): string[] {
  const matches = text.match(TICKER_TOKEN_RE) ?? [];
  const found = new Set<string>();
  for (const token of matches) {
    if (knownTickers) {
      if (knownTickers.has(token)) found.add(token);
      continue;
    }
    if (!COMMON_NON_TICKER_ACRONYMS.has(token)) found.add(token);
  }
  return [...found];
}

/** Parses RSS-style pub dates (RFC 822/2822, with 2 or 4 digit years) into ISO 8601. */
export function parseFeedDate(raw: string | undefined): string {
  if (!raw) return new Date().toISOString();
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime()) && direct.getFullYear() > 2000) {
    return direct.toISOString();
  }
  // Fall back for two-digit-year RFC 822 dates some feeds emit, e.g. "Wed, 22 Jul 26 02:00:00 +0700".
  const twoDigitYearMatch = raw.match(
    /^(\w{3}), (\d{1,2}) (\w{3}) (\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{4})$/,
  );
  if (twoDigitYearMatch) {
    const [, , day, month, yy, time, tz] = twoDigitYearMatch;
    const fixed = new Date(`${day} ${month} 20${yy} ${time} ${tz}`);
    if (!Number.isNaN(fixed.getTime())) return fixed.toISOString();
  }
  return new Date().toISOString();
}

/** Converts a unix epoch (seconds) as returned by HOSE's JSON API into ISO 8601. */
export function epochSecondsToIso(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toISOString();
}

const DIACRITICS_MAP: [RegExp, string][] = [
  [/[àáạảãâầấậẩẫăằắặẳẵ]/g, 'a'],
  [/[èéẹẻẽêềếệểễ]/g, 'e'],
  [/[ìíịỉĩ]/g, 'i'],
  [/[òóọỏõôồốộổỗơờớợởỡ]/g, 'o'],
  [/[ùúụủũưừứựửữ]/g, 'u'],
  [/[ỳýỵỷỹ]/g, 'y'],
  [/đ/g, 'd'],
];

export function slugify(title: string): string {
  let s = title.toLowerCase();
  for (const [re, replacement] of DIACRITICS_MAP) s = s.replace(re, replacement);
  return s
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

export function absoluteUrl(base: string, maybeRelative: string): string {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}

/**
 * Renders a feed result as a compact markdown digest suitable for pasting
 * directly into an LLM prompt/context window for analysis or decision support.
 */
export function toMarkdownDigest(items: NewsItem[]): string {
  return items
    .map((item) => {
      const tickers = item.tickers.length ? ` [${item.tickers.join(', ')}]` : '';
      const lines = [
        `### ${item.title}${tickers}`,
        `- Source: ${item.source}${item.originalSource ? ` (via ${item.originalSource})` : ''}`,
        `- Published: ${item.publishedAt}`,
        `- Type: ${item.sourceType}`,
        `- URL: ${item.url}`,
      ];
      if (item.summary) lines.push(`- Summary: ${item.summary}`);
      return lines.join('\n');
    })
    .join('\n\n');
}
