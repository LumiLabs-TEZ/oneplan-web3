/**
 * Version-footer formatting — port of `SettingView.serverCommitDisplayText` /
 * `versionDisplayText` (SettingView.swift:430-448).
 */
import type { TFunction } from 'i18next';

/** First 7 chars of a commit hash, or `'--'` when absent/blank. */
export function shortCommit(hash: string | null | undefined): string {
  const trimmed = hash?.trim();
  if (!trimmed) return '--';
  return trimmed.slice(0, 7);
}

/** `'--'` when the bundle value is absent/blank (mirrors iOS `bundleValue(for:)`). */
function bundleValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : '--';
}

/** `t('Version %@ (%@)')` filled with the app version/build. */
export function versionLabel(
  version: string | null | undefined,
  build: string | null | undefined,
  t: TFunction,
): string {
  return t('Version %@ (%@)', { 0: bundleValue(version), 1: bundleValue(build) });
}
