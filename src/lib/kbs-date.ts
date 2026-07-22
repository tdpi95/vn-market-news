/**
 * KB Securities' timestamps have no timezone designator (e.g.
 * "2025-12-31T00:00:00") across every endpoint that returns them (finance
 * report periods, company profile/shareholder/ownership records). `new
 * Date(...)` would parse that as the executing machine's local time, not
 * Vietnam's — pin it to +07:00 explicitly instead (Vietnam has no DST).
 */
export function naiveVnTimestampToIso(naiveTimestamp: string): string {
  return new Date(`${naiveTimestamp}+07:00`).toISOString();
}

/**
 * Converts KBS's "DD/MM/YYYY" date strings (company profile dates, capital
 * history) to ISO 8601 at Vietnam midnight. Returns undefined for
 * empty/unparsable input, which KBS sends for some companies' founding date.
 */
export function ddmmyyyyToIso(date: string | undefined): string | undefined {
  if (!date) return undefined;
  const match = date.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return undefined;
  const [, day, month, year] = match;
  return naiveVnTimestampToIso(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00`);
}
