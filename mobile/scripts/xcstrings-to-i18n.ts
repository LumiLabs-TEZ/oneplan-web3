#!/usr/bin/env tsx
/**
 * Localizable.xcstrings + InfoPlist.xcstrings → i18next JSON.
 *   pnpm i18n:gen            # writes src/i18n/locales/{en,vi}.json + src/i18n/infoplist/{en,vi}.json
 *   pnpm i18n:gen --report   # also prints untranslated keys / placeholder mismatches
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  convertInfoPlist,
  convertXcstrings,
  formatReport,
  type Xcstrings,
} from '../src/i18n/convert';

const ROOT = resolve(__dirname, '..');
const IOS = resolve(ROOT, '../ios/OnePlan/OnePlan');
const LOCALES = ['en', 'vi'];

function readCatalog(path: string): Xcstrings {
  return JSON.parse(readFileSync(path, 'utf8')) as Xcstrings;
}

function writeJson(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const strings = readCatalog(resolve(IOS, 'Localizable.xcstrings'));
const { resources, report } = convertXcstrings(strings, LOCALES);
for (const locale of LOCALES) {
  writeJson(resolve(ROOT, `src/i18n/locales/${locale}.json`), resources[locale]);
}

const infoPlist = convertInfoPlist(readCatalog(resolve(IOS, 'InfoPlist.xcstrings')), LOCALES);
for (const locale of LOCALES) {
  writeJson(resolve(ROOT, `src/i18n/infoplist/${locale}.json`), infoPlist[locale]);
}

const summary = formatReport(report);
if (process.argv.includes('--report')) {
  console.log(summary);
} else {
  console.log(summary.split('\n')[0]);
}
