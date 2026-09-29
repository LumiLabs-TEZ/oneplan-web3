/**
 * Pure conversion of Apple String Catalog (.xcstrings) → i18next resources.
 * Used by scripts/xcstrings-to-i18n.ts and unit-tested directly.
 *
 * Rules
 * - i18n key == xcstrings key (the English source string) so screens port 1:1.
 * - `%@`, `%lld`, `%d`, `%f` … → `{{0}}`, `{{1}}` in order of appearance;
 *   positional `%2$@` → `{{1}}` (positional wins, so en/vi can reorder args).
 * - Plural variations → `key_one` / `key_other`; the integer placeholder that
 *   drives the plural becomes `{{count}}` (i18next's plural variable). Other
 *   placeholders keep their argument index.
 * - Missing locale value → fall back to the English value and record it.
 * - Keys with no localizations at all (e.g. "0", "-") are emitted with the key
 *   as their value so `t(key)` still resolves.
 */

export interface StringUnit {
  state?: string;
  value: string;
}
export interface Localization {
  stringUnit?: StringUnit;
  variations?: {
    plural?: Record<string, { stringUnit: StringUnit }>;
  };
}
export interface XcstringsEntry {
  comment?: string;
  shouldTranslate?: boolean;
  localizations?: Record<string, Localization>;
}
export interface Xcstrings {
  sourceLanguage: string;
  strings: Record<string, XcstringsEntry>;
  version?: string;
}

export type Resources = Record<string, string>;

export interface ConversionReport {
  total: number;
  plurals: number;
  withPlaceholders: number;
  /** locale → keys that fell back to English */
  missing: Record<string, string[]>;
  /** keys whose translated placeholder set differs from English */
  placeholderMismatch: { key: string; locale: string; en: string; other: string }[];
}

export interface ConversionResult {
  resources: Record<string, Resources>;
  report: ConversionReport;
}

const PLACEHOLDER_RE =
  /%(\d+\$)?(?:[0-9.]*)(?:l{1,2}|h{1,2}|q|z|t|j)?([@dDiuUxXoOfFeEgGcCsSaAp%])/g;
const INT_SPECIFIERS = new Set(['d', 'D', 'i', 'u', 'U', 'x', 'X', 'o', 'O']);

/** Convert a printf-style Apple format string into an i18next template. */
export function convertPlaceholders(value: string, opts: { plural?: boolean } = {}): string {
  let seq = 0;
  let countAssigned = false;
  return value.replace(PLACEHOLDER_RE, (_m, pos: string | undefined, spec: string) => {
    if (spec === '%') return '%';
    const index = pos ? Number.parseInt(pos, 10) - 1 : seq;
    seq = Math.max(seq, index + 1);
    if (opts.plural && !countAssigned && INT_SPECIFIERS.has(spec)) {
      countAssigned = true;
      return '{{count}}';
    }
    return `{{${index}}}`;
  });
}

/** Placeholder signature used to detect en/vi drift ("{{0}}{{count}}" etc.). */
function placeholderSignature(template: string): string {
  return [...template.matchAll(/\{\{(\w+)\}\}/g)]
    .map((m) => m[1])
    .sort()
    .join(',');
}

function unitValue(loc: Localization | undefined): string | undefined {
  return loc?.stringUnit?.value;
}

export function convertXcstrings(
  catalog: Xcstrings,
  locales: string[],
  options: { sourceLocale?: string } = {},
): ConversionResult {
  const source = options.sourceLocale ?? catalog.sourceLanguage ?? 'en';
  const resources: Record<string, Resources> = Object.fromEntries(locales.map((l) => [l, {}]));
  const report: ConversionReport = {
    total: 0,
    plurals: 0,
    withPlaceholders: 0,
    missing: Object.fromEntries(locales.map((l) => [l, [] as string[]])),
    placeholderMismatch: [],
  };

  const keys = Object.keys(catalog.strings).sort((a, b) => a.localeCompare(b, 'en'));
  for (const key of keys) {
    const entry = catalog.strings[key] ?? {};
    report.total += 1;
    const locs = entry.localizations ?? {};
    const sourceLoc = locs[source];
    const isPlural =
      Boolean(sourceLoc?.variations?.plural) || locales.some((l) => locs[l]?.variations?.plural);

    if (PLACEHOLDER_RE.test(key)) report.withPlaceholders += 1;
    PLACEHOLDER_RE.lastIndex = 0;

    if (isPlural) {
      report.plurals += 1;
      const sourcePlural = sourceLoc?.variations?.plural ?? {};
      const sourceOther = sourcePlural.other?.stringUnit.value ?? key;
      for (const locale of locales) {
        const plural = locs[locale]?.variations?.plural;
        const target = resources[locale]!;
        if (!plural) {
          report.missing[locale]!.push(key);
        }
        // Emit every category the source has; fall back per category.
        const categories = new Set([...Object.keys(sourcePlural), ...Object.keys(plural ?? {})]);
        if (categories.size === 0) categories.add('other');
        for (const category of categories) {
          const own = plural?.[category]?.stringUnit.value;
          // A category the target's own catalog never defines (e.g. `vi` has no CLDR "one" —
          // Vietnamese has no grammatical plural) is not a missing translation; it's a category
          // that locale doesn't distinguish. Prefer the target's own translated "other" over the
          // source's category value, so a translated locale never shows untranslated source text
          // for a category it simply doesn't have — only an entirely-missing plural block (no
          // `plural` at all for this key) falls all the way back to the source.
          const ownOther = plural?.other?.stringUnit.value;
          const fallback = sourcePlural[category]?.stringUnit.value ?? sourceOther;
          const raw = own ?? ownOther ?? fallback;
          const converted = convertPlaceholders(raw, { plural: true });
          target[`${key}_${category}`] = converted;
          if (own && locale !== source) {
            const enSig = placeholderSignature(convertPlaceholders(fallback, { plural: true }));
            const sig = placeholderSignature(converted);
            if (enSig !== sig) {
              report.placeholderMismatch.push({ key, locale, en: fallback, other: own });
            }
          }
        }
      }
      continue;
    }

    const sourceValue = unitValue(sourceLoc) ?? key;
    const sourceTemplate = convertPlaceholders(sourceValue);
    for (const locale of locales) {
      const own = unitValue(locs[locale]);
      const target = resources[locale]!;
      if (own === undefined) {
        if (locale !== source) report.missing[locale]!.push(key);
        target[key] = sourceTemplate;
        continue;
      }
      const converted = convertPlaceholders(own);
      target[key] = converted;
      if (
        locale !== source &&
        placeholderSignature(converted) !== placeholderSignature(sourceTemplate)
      ) {
        report.placeholderMismatch.push({ key, locale, en: sourceValue, other: own });
      }
    }
  }

  return { resources, report };
}

/** InfoPlist.xcstrings → flat `{ NSCameraUsageDescription: "..." }` per locale. */
export function convertInfoPlist(catalog: Xcstrings, locales: string[]): Record<string, Resources> {
  const out: Record<string, Resources> = Object.fromEntries(locales.map((l) => [l, {}]));
  const source = catalog.sourceLanguage ?? 'en';
  for (const [key, entry] of Object.entries(catalog.strings)) {
    const locs = entry.localizations ?? {};
    const sourceValue = unitValue(locs[source]) ?? key;
    for (const locale of locales) {
      out[locale]![key] = unitValue(locs[locale]) ?? sourceValue;
    }
  }
  return out;
}

export function formatReport(report: ConversionReport): string {
  const lines = [
    `keys: ${report.total}  plurals: ${report.plurals}  with placeholders: ${report.withPlaceholders}`,
  ];
  for (const [locale, keys] of Object.entries(report.missing)) {
    if (keys.length === 0) continue;
    lines.push(`\n[${locale}] ${keys.length} keys fell back to English:`);
    for (const k of keys) lines.push(`  - ${JSON.stringify(k)}`);
  }
  if (report.placeholderMismatch.length > 0) {
    lines.push(`\n${report.placeholderMismatch.length} placeholder mismatches:`);
    for (const m of report.placeholderMismatch) {
      lines.push(
        `  - [${m.locale}] ${JSON.stringify(m.key)}\n      en: ${m.en}\n      ${m.locale}: ${m.other}`,
      );
    }
  }
  return lines.join('\n');
}
