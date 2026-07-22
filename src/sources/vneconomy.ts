import { createRssNewsSource } from '../lib/rss-source.js';
import type { NewsSource } from '../types.js';

// Confirmed live: category feeds live at the top-level path
// (vneconomy.vn/{category}.rss) — the /rss/{category}.rss pattern other
// sites use returns an empty "No Content" placeholder feed here instead.
const CHANNELS = [
  { url: 'https://vneconomy.vn/chung-khoan.rss', category: 'chung-khoan' },
  { url: 'https://vneconomy.vn/tai-chinh.rss', category: 'tai-chinh' },
];

export function createVnEconomySource(): NewsSource {
  return createRssNewsSource('vneconomy', CHANNELS);
}
