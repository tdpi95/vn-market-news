import { createRssNewsSource } from '../lib/rss-source.js';
import type { NewsSource } from '../types.js';

// Diễn Đàn Doanh Nghiệp (VCCI's business newspaper). Confirmed live via the
// site's own RSS index (diendandoanhnghiep.vn/rss) — top-level category
// guesses like "kinh-te.rss"/"kinh-te" 404/redirect, and the nested
// "kinh-te/dau-tu" path returns an empty body; only paths taken directly
// from the index below are used.
const CHANNELS = [
  { url: 'https://diendandoanhnghiep.vn/rss/ngan-hang-chung-khoan/chung-khoan', category: 'chung-khoan' },
  { url: 'https://diendandoanhnghiep.vn/rss/doanh-nghiep', category: 'doanh-nghiep' },
];

export function createDddnSource(): NewsSource {
  return createRssNewsSource('dddn', CHANNELS);
}
