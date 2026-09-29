/**
 * "Check for updates" row + footer formatting. RN-only (no SwiftUI counterpart): lets testers
 * pull the latest EAS Update on demand and see which bundle is running.
 */
import type { TFunction } from 'i18next';

export type AppUpdateStatus =
  'idle' | 'checking' | 'downloading' | 'upToDate' | 'restarting' | 'unavailable' | 'error';

export function isUpdateBusy(status: AppUpdateStatus): boolean {
  return status === 'checking' || status === 'downloading' || status === 'restarting';
}

/** Trailing text for the row; `undefined` while idle so the row shows only its title. */
export function updateStatusLabel(status: AppUpdateStatus, t: TFunction): string | undefined {
  switch (status) {
    case 'checking':
      return t('Checking…');
    case 'downloading':
      return t('Downloading…');
    case 'upToDate':
      return t('Up to date');
    case 'restarting':
      return t('Restarting…');
    case 'unavailable':
      return t('Not available');
    case 'error':
      return t('Failed');
    default:
      return undefined;
  }
}

export interface RunningBundle {
  isEmbeddedLaunch: boolean;
  updateId: string | null;
  channel: string | null;
}

/** Footer line, e.g. `dev · 01a0dd0` for an OTA bundle or `dev · embedded` for the binary's own. */
export function updateBuildLabel({ isEmbeddedLaunch, updateId, channel }: RunningBundle): string {
  const bundle = isEmbeddedLaunch || !updateId ? 'embedded' : updateId.slice(0, 7);
  return `${channel?.trim() || '--'} · ${bundle}`;
}
