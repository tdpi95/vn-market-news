import { createRssNewsSource } from '../lib/rss-source.js';
import type { NewsSource } from '../types.js';

// Znews (formerly Zingnews; zingnews.vn now 301s to znews.vn) only exposes
// one relevant category feed — confirmed live, other guessed slugs like
// "chung-khoan"/"tai-chinh"/"doanh-nghiep" all 404.
const CHANNELS = [{ url: 'https://znews.vn/rss/kinh-doanh-tai-chinh.rss', category: 'kinh-doanh-tai-chinh' }];

export function createZnewsSource(): NewsSource {
  return createRssNewsSource('znews', CHANNELS);
}
