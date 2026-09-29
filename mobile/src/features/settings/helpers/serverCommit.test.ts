import { t } from 'i18next';

import { initI18n } from '@/i18n';

import { shortCommit, versionLabel } from './serverCommit';

describe('shortCommit', () => {
  it('returns the first 7 characters', () => {
    expect(shortCommit('c8057b18abcdef')).toBe('c8057b1');
  });

  it('returns "--" for null/undefined/blank', () => {
    expect(shortCommit(null)).toBe('--');
    expect(shortCommit(undefined)).toBe('--');
    expect(shortCommit('   ')).toBe('--');
  });

  it('returns the whole hash when shorter than 7 characters', () => {
    expect(shortCommit('abc')).toBe('abc');
  });
});

describe('versionLabel', () => {
  beforeAll(() => {
    initI18n();
  });

  it('fills version and build', () => {
    expect(versionLabel('1.5.0', '42', t)).toBe('Version 1.5.0 (42)');
  });

  it('falls back to "--" for missing version/build', () => {
    expect(versionLabel(null, undefined, t)).toBe('Version -- (--)');
  });
});
