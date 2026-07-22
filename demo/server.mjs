import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { VnMarketNews } from '../dist/index.js';

// None of the upstream sources send CORS headers for arbitrary browser
// origins, so the UI can't call them directly from the page. This server
// runs the library (which uses server-side fetch/node:crypto) and exposes
// it to the browser over same-origin JSON endpoints instead.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT ? Number(process.env.PORT) : 4173;

const client = new VnMarketNews();

function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function parseSources(value) {
  if (!value) return undefined;
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseLimit(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.method !== 'GET') {
      return sendJson(res, 405, { error: 'method not allowed' });
    }

    const limit = parseLimit(url.searchParams.get('limit'), 15);
    const sources = parseSources(url.searchParams.get('sources'));

    if (url.pathname === '/api/market') {
      const result = await client.getMarketNews({ limit, sources });
      return sendJson(res, 200, result);
    }

    if (url.pathname === '/api/company') {
      const ticker = url.searchParams.get('ticker')?.trim();
      if (!ticker) return sendJson(res, 400, { error: 'ticker query param is required' });
      const result = await client.getCompanyNews({ ticker, limit, sources });
      return sendJson(res, 200, result);
    }

    if (url.pathname === '/api/search') {
      const keyword = url.searchParams.get('keyword')?.trim();
      if (!keyword) return sendJson(res, 400, { error: 'keyword query param is required' });
      const result = await client.search({ keyword, limit, sources });
      return sendJson(res, 200, result);
    }

    // These two hit a single source with no fallback, so unlike the news
    // routes above they throw on failure — the catch block below turns
    // that into a 500 with the error message instead of sourceErrors.
    if (url.pathname === '/api/financials') {
      const ticker = url.searchParams.get('ticker')?.trim();
      if (!ticker) return sendJson(res, 400, { error: 'ticker query param is required' });
      const statementType = url.searchParams.get('statementType') || undefined;
      const period = url.searchParams.get('period') || undefined;
      const result = await client.getFinancialStatements(ticker, { statementType, period });
      return sendJson(res, 200, result);
    }

    if (url.pathname === '/api/company-info') {
      const ticker = url.searchParams.get('ticker')?.trim();
      if (!ticker) return sendJson(res, 400, { error: 'ticker query param is required' });
      const result = await client.getCompanyInfo(ticker);
      return sendJson(res, 200, result);
    }

    if (url.pathname === '/api/symbols') {
      const type = url.searchParams.get('type') || undefined;
      const query = url.searchParams.get('query') || undefined;
      const symbols = await client.listSymbols({ type, query, limit });
      return sendJson(res, 200, { symbols });
    }

    if (url.pathname === '/api/funds/search') {
      const query = url.searchParams.get('query') ?? '';
      const assetType = url.searchParams.get('assetType') || undefined;
      const funds = await client.searchFunds(query, { limit, assetType });
      return sendJson(res, 200, { funds });
    }

    if (url.pathname === '/api/funds/detail') {
      const symbol = url.searchParams.get('symbol')?.trim();
      if (!symbol) return sendJson(res, 400, { error: 'symbol query param is required' });
      const includeNavHistory = url.searchParams.get('includeNavHistory') === 'true';
      const result = await client.getFundDetail(symbol, { includeNavHistory });
      return sendJson(res, 200, result);
    }

    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
  } catch (err) {
    sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`vn-market-news demo running at http://localhost:${PORT}`);
});
