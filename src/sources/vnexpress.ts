import { createRssNewsSource } from '../lib/rss-source.js';
import type { NewsSource } from '../types.js';

// VnExpress's RSS index (https://vnexpress.net/rss) only exposes broad
// section feeds, not a dedicated stock-market/finance sub-feed (confirmed
// live: /rss/kinh-doanh/chung-khoan.rss doesn't exist, unlike the URL
// pattern the site's own category pages use) — "kinh-doanh" (business) is
// the closest available category.
const CHANNELS = [{ url: 'https://vnexpress.net/rss/kinh-doanh.rss', category: 'kinh-doanh' }];

export function createVnExpressSource(): NewsSource {
  return createRssNewsSource('vnexpress', CHANNELS);
}
