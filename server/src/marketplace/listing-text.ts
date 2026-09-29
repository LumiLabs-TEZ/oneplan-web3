import { ContentLocale } from '@prisma/client';

export type ListingTranslationRow = {
  locale: ContentLocale;
  name: string;
  description: string | null;
};

export type ItemTranslationRow = {
  locale: ContentLocale;
  title: string;
  description: string | null;
};

/**
 * Resolve the listing text to show for `locale`.
 *
 * `locale === null` means "base row" (no / unsupported Accept-Language).
 * The base columns are always in `sourceLocale`; a translation row is used
 * only when one exists for the requested locale. Per-field fallback: a
 * translation with a null description falls back to the base description.
 */
export function pickListingText(
  listing: {
    name: string;
    description: string | null;
    sourceLocale: ContentLocale;
    translations?: ListingTranslationRow[];
  },
  locale: ContentLocale | null,
): { name: string; description: string | null } {
  const t = findTranslation(listing.translations, listing.sourceLocale, locale);
  return t
    ? { name: t.name, description: t.description ?? listing.description }
    : { name: listing.name, description: listing.description };
}

export function pickItemText(
  item: {
    title: string;
    description: string | null;
    translations?: ItemTranslationRow[];
  },
  sourceLocale: ContentLocale,
  locale: ContentLocale | null,
): { title: string; description: string | null } {
  const t = findTranslation(item.translations, sourceLocale, locale);
  return t
    ? { title: t.title, description: t.description ?? item.description }
    : { title: item.title, description: item.description };
}

/** Locales a listing can be served in: its source plus every translation row. */
export function availableLocales(listing: {
  sourceLocale: ContentLocale;
  translations?: { locale: ContentLocale }[];
}): ContentLocale[] {
  const set = new Set<ContentLocale>([listing.sourceLocale]);
  for (const t of listing.translations ?? []) set.add(t.locale);
  return [...set];
}

function findTranslation<T extends { locale: ContentLocale }>(
  rows: T[] | undefined,
  sourceLocale: ContentLocale,
  locale: ContentLocale | null,
): T | undefined {
  if (locale === null || locale === sourceLocale) return undefined;
  return rows?.find((r) => r.locale === locale);
}
