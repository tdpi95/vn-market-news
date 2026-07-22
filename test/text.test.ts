import { describe, expect, it } from 'vitest';
import { extractTickers, parseFeedDate, slugify, stripHtml } from '../src/lib/text.js';

describe('stripHtml', () => {
  it('removes tags and decodes common entities', () => {
    expect(stripHtml('<b>Hello</b> &amp; <i>world</i>')).toBe('Hello & world');
    expect(stripHtml("<p>It&#39;s a &quot;test&quot;</p>")).toBe('It\'s a "test"');
  });

  it('passes through undefined', () => {
    expect(stripHtml(undefined)).toBeUndefined();
  });
});

describe('extractTickers', () => {
  it('extracts plausible ticker tokens and ignores common acronyms', () => {
    const tickers = extractTickers('HPG va VNM tang gia, CEO cong ty noi ve GDP');
    expect(tickers).toContain('HPG');
    expect(tickers).toContain('VNM');
    expect(tickers).not.toContain('CEO');
    expect(tickers).not.toContain('GDP');
  });

  it('restricts to a known ticker set when provided', () => {
    const known = new Set(['HPG']);
    const tickers = extractTickers('HPG and FAKE and VNM', known);
    expect(tickers).toEqual(['HPG']);
  });
});

describe('parseFeedDate', () => {
  it('parses standard 4-digit-year RFC 822 dates', () => {
    const iso = parseFeedDate('Wed, 22 Jul 2026 08:00:00 +0700');
    expect(iso).toBe(new Date('Wed, 22 Jul 2026 08:00:00 +0700').toISOString());
  });

  it('parses 2-digit-year dates as seen on some CafeF feeds', () => {
    const iso = parseFeedDate('Wed, 22 Jul 26 02:00:00 +0700');
    expect(iso.startsWith('2026-')).toBe(true);
  });

  it('falls back to now for unparsable input', () => {
    const iso = parseFeedDate('not a date');
    expect(() => new Date(iso).toISOString()).not.toThrow();
  });
});

describe('slugify', () => {
  it('removes Vietnamese diacritics and kebab-cases', () => {
    expect(slugify('Thông báo về ngày đăng ký cuối cùng')).toBe('thong-bao-ve-ngay-dang-ky-cuoi-cung');
  });
});
