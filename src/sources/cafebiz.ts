import { createRssNewsSource } from '../lib/rss-source.js';
import type { NewsSource } from '../types.js';

// Cafebiz is VCCorp's other business-news outlet (same publisher as CafeF),
// with the same rss.chn-index/category-feed structure. Confirmed live.
const CHANNELS = [
  { url: 'https://cafebiz.vn/rss/chung-khoan.rss', category: 'chung-khoan' },
  { url: 'https://cafebiz.vn/rss/dau-tu.rss', category: 'dau-tu' },
  { url: 'https://cafebiz.vn/rss/khoi-tai-chinh-ngan-hang.rss', category: 'khoi-tai-chinh-ngan-hang' },
];

export function createCafebizSource(): NewsSource {
  return createRssNewsSource('cafebiz', CHANNELS);
}
