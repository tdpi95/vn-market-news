import { SourceHttpError } from '../errors.js';

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_USER_AGENT =
  'vn-market-news/0.1 (+https://www.npmjs.com/package/vn-market-news) Node.js';

export interface HttpRequestOptions {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  method?: 'GET' | 'POST';
  body?: string;
}

/**
 * Fetch failures from undici are almost always `TypeError: fetch failed`
 * with the actionable detail buried in `.cause` (a TLS/DNS/connection
 * error). Walk the cause chain so users see e.g. "unable to verify the
 * first certificate" instead of just "fetch failed".
 */
function describeFetchError(err: unknown): string {
  const parts: string[] = [];
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current);
    const e = current as { message?: string; code?: string; cause?: unknown };
    if (e.message) parts.push(e.code ? `${e.message} (${e.code})` : e.message);
    current = e.cause;
  }
  return parts.length ? parts.join(' -> ') : String(err);
}

function combineSignals(a?: AbortSignal, b?: AbortSignal): AbortSignal {
  if (!a) return b!;
  if (!b) return a;
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  a.addEventListener('abort', onAbort, { once: true });
  b.addEventListener('abort', onAbort, { once: true });
  if (a.aborted || b.aborted) controller.abort();
  return controller.signal;
}

async function requestOnce(
  source: string,
  url: string,
  opts: HttpRequestOptions,
): Promise<Response> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(), timeoutMs);
  const signal = combineSignals(timeoutController.signal, opts.signal);

  try {
    const res = await fetch(url, {
      method: opts.method ?? 'GET',
      headers: {
        'user-agent': DEFAULT_USER_AGENT,
        accept: 'application/json, application/rss+xml, text/xml, text/html, */*',
        ...opts.headers,
      },
      body: opts.body,
      signal,
    });
    return res;
  } catch (err) {
    if (timeoutController.signal.aborted) {
      throw new SourceHttpError(source, url, undefined, `timed out after ${timeoutMs}ms`);
    }
    throw new SourceHttpError(source, url, undefined, describeFetchError(err), { cause: err });
  } finally {
    clearTimeout(timer);
  }
}

async function requestWithRetry(
  source: string,
  url: string,
  opts: HttpRequestOptions,
): Promise<Response> {
  const retries = opts.retries ?? DEFAULT_RETRIES;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await requestOnce(source, url, opts);
      if (res.status >= 500 && attempt < retries) {
        lastErr = new SourceHttpError(source, url, res.status, res.statusText);
        await sleep(backoffMs(attempt));
        continue;
      }
      if (!res.ok) {
        throw new SourceHttpError(source, url, res.status, res.statusText);
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetryable(err)) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

function isRetryable(err: unknown): boolean {
  if (!(err instanceof SourceHttpError)) return false;
  return err.status === undefined || err.status >= 500;
}

function backoffMs(attempt: number): number {
  return 250 * 2 ** attempt;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function httpGetText(
  source: string,
  url: string,
  opts: HttpRequestOptions = {},
): Promise<string> {
  const res = await requestWithRetry(source, url, { ...opts, method: 'GET' });
  return res.text();
}

export async function httpGetJson<T>(
  source: string,
  url: string,
  opts: HttpRequestOptions = {},
): Promise<T> {
  const text = await httpGetText(source, url, opts);
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new SourceHttpError(source, url, undefined, `invalid JSON response: ${(err as Error).message}`);
  }
}

export async function httpPostJson<T>(
  source: string,
  url: string,
  body: unknown,
  opts: HttpRequestOptions = {},
): Promise<T> {
  const res = await requestWithRetry(source, url, {
    ...opts,
    method: 'POST',
    headers: { 'content-type': 'application/json', ...opts.headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new SourceHttpError(source, url, undefined, `invalid JSON response: ${(err as Error).message}`);
  }
}
