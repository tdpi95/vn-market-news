export class SourceHttpError extends Error {
  constructor(
    public readonly source: string,
    public readonly url: string,
    public readonly status: number | undefined,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(`[${source}] HTTP ${status ?? 'error'} fetching ${url}: ${message}`, options);
    this.name = 'SourceHttpError';
  }
}

export class SourceParseError extends Error {
  constructor(
    public readonly source: string,
    message: string,
  ) {
    super(`[${source}] failed to parse response: ${message}`);
    this.name = 'SourceParseError';
  }
}

/**
 * For adapters that scrape HTML rather than call a documented API: thrown
 * when the expected page structure isn't found, signaling "the source
 * likely changed shape" rather than silently returning empty/wrong data.
 */
export class SourceUnavailableError extends Error {
  constructor(
    public readonly source: string,
    message: string,
  ) {
    super(`[${source}] source unavailable: ${message}`);
    this.name = 'SourceUnavailableError';
  }
}
