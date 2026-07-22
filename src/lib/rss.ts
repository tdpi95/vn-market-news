import { XMLParser } from 'fast-xml-parser';
import { SourceParseError } from '../errors.js';

export interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  guid?: string;
  category?: string[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  trimValues: true,
});

function asText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text']);
  }
  return undefined;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** Parses a generic RSS 2.0 feed (as used by HOSE, Vietstock, CafeF) into plain items. */
export function parseRss(source: string, xml: string): RssItem[] {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch (err) {
    throw new SourceParseError(source, `invalid XML: ${(err as Error).message}`);
  }

  const rss = doc as { rss?: { channel?: unknown } };
  const channel = rss.rss?.channel as Record<string, unknown> | undefined;
  if (!channel) {
    throw new SourceParseError(source, 'no <rss><channel> element found');
  }

  const rawItems = asArray(channel.item as Record<string, unknown> | Record<string, unknown>[]);

  return rawItems
    .map((raw): RssItem | null => {
      const title = asText(raw.title);
      const link = asText(raw.link);
      if (!title || !link) return null;
      return {
        title,
        link,
        // Some feeds (e.g. HOSE's) omit <pubDate> and only carry an Atom
        // <a10:updated>/<updated> timestamp instead.
        pubDate: asText(raw.pubDate) ?? asText(raw['a10:updated']) ?? asText(raw.updated),
        description: asText(raw.description),
        guid: asText(raw.guid),
        category: asArray(raw.category as string | string[] | undefined)
          .map(asText)
          .filter((c): c is string => !!c),
      };
    })
    .filter((item): item is RssItem => item !== null);
}
