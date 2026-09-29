/**
 * Add new EN-source keys (with VI translations) to the iOS String Catalog, which stays the
 * i18n source of truth until Phase 9. Usage:
 *   pnpm tsx scripts/add-xcstrings-keys.ts '<key>' '<vi>' '<comment>' [...]
 * Then run `pnpm i18n:gen`.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const FILE = resolve(__dirname, '../../ios/OnePlan/OnePlan/Localizable.xcstrings');

interface Catalog {
  sourceLanguage: string;
  strings: Record<string, unknown>;
  version: string;
}

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 3 !== 0) {
  console.error('usage: add-xcstrings-keys <key> <vi> <comment> [...]');
  process.exit(1);
}

const raw = readFileSync(FILE, 'utf8');
const catalog = JSON.parse(raw) as Catalog;
let added = 0;
for (let i = 0; i < args.length; i += 3) {
  const [key, vi, comment] = [args[i]!, args[i + 1]!, args[i + 2]!];
  if (key in catalog.strings) {
    console.log(`skip (exists): ${key}`);
    continue;
  }
  catalog.strings[key] = {
    comment,
    localizations: { vi: { stringUnit: { state: 'translated', value: vi } } },
  };
  added += 1;
}
// Xcode's key collation is not reproducible here; new keys are appended and Xcode re-sorts on next save.
// Xcode writes 2-space JSON with " : " separators; match it so the diff stays minimal.
const out = JSON.stringify(catalog, null, 2)
  .replace(/^(\s*"(?:[^"\\]|\\.)*")\s*:/gm, '$1 :')
  .replace(/\{\}/g, '{\n\n    }');
writeFileSync(FILE, out + '\n');
console.log(`added ${added} key(s)`);
