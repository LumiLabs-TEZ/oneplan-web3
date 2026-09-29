import { ContentLocale } from '@prisma/client';

/** CLS key under which the request's content locale is stored. */
export const CONTENT_LOCALE_CLS_KEY = 'contentLocale';

const SUPPORTED = new Set<string>(Object.values(ContentLocale));

/**
 * Resolve the marketplace content locale from an `Accept-Language` header.
 *
 * Returns the first tag (in header order) whose primary subtag is a supported
 * `ContentLocale`, or `null` when the header is missing or lists no supported
 * language. `null` deliberately means "serve the base row" — older iOS builds
 * send no header and must keep seeing untranslated text.
 */
export function parseAcceptLanguage(
  header: string | string[] | undefined | null,
): ContentLocale | null {
  const raw = Array.isArray(header) ? header[0] : header;
  if (!raw) return null;
  for (const part of raw.split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase();
    if (!tag) continue;
    const primary = tag.split('-')[0];
    if (SUPPORTED.has(primary)) return primary as ContentLocale;
  }
  return null;
}
