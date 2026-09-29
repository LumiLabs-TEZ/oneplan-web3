/**
 * Forced-update gate — client-side only (locked decision, see
 * `docs/superpowers/specs/parity/wave3-forced-update-parity-checklist.md`).
 * iOS: iTunes lookup by bundle id, numeric version compare, fail-open
 * (`Services/VersionCheckManager.swift`). Android: Play In-App Updates IMMEDIATE via
 * `sp-react-native-in-app-updates`, fail-open (`core/data/update/AppUpdateGate.kt`).
 * Runs once at launch; any error / offline → no gate.
 */
import * as Application from 'expo-application';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Linking, Platform } from 'react-native';

export interface UpdateInfo {
  currentVersion: string;
  availableVersion: string | null;
  /** Store URL (iOS `trackViewUrl` without query) or `market://` on Android. */
  storeUrl: string;
  platform: 'ios' | 'android';
}

/** Numeric segment compare like `String.compare(_:options:.numeric)`: -1 / 0 / 1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((s) => parseInt(s, 10));
  const pb = b.split('.').map((s) => parseInt(s, 10));
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (Number.isNaN(x) || Number.isNaN(y)) return 0; // malformed → treat as equal (no gate)
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function isUpdateRequired(current: string, store: string): boolean {
  return compareVersions(current, store) < 0;
}

interface ItunesLookup {
  results?: { version?: string; trackViewUrl?: string }[];
}

/** iOS: `https://itunes.apple.com/lookup?bundleId=…`. Returns `null` unless strictly behind. */
export async function checkIosStoreVersion(
  bundleId: string,
  currentVersion: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UpdateInfo | null> {
  try {
    const res = await fetchImpl(
      `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}`,
    );
    if (!res.ok) return null;
    const json = (await res.json()) as ItunesLookup;
    const first = json.results?.[0];
    if (!first?.version || !first.trackViewUrl) return null;
    if (!isUpdateRequired(currentVersion, first.version)) return null;
    return {
      currentVersion,
      availableVersion: first.version,
      storeUrl: first.trackViewUrl.split('?')[0] ?? first.trackViewUrl,
      platform: 'ios',
    };
  } catch {
    return null;
  }
}

/** Android: Play In-App Updates. Any available update blocks (iOS forces every newer version). */
export async function checkAndroidUpdate(
  packageName: string,
  currentVersion: string,
): Promise<UpdateInfo | null> {
  try {
    const { default: SpInAppUpdates } = await import('sp-react-native-in-app-updates');
    const updater = new SpInAppUpdates(false);
    const result = await updater.checkNeedsUpdate({ curVersion: currentVersion });
    if (!result.shouldUpdate) return null;
    return {
      currentVersion,
      availableVersion: result.storeVersion ?? null,
      storeUrl: `market://details?id=${packageName}`,
      platform: 'android',
    };
  } catch {
    return null;
  }
}

/** Dev/preview builds: `EXPO_PUBLIC_FORCE_UPDATE_GATE=1` forces the screen for manual QA. */
export function forcedGateOverride(): UpdateInfo | null {
  if (process.env.EXPO_PUBLIC_FORCE_UPDATE_GATE !== '1') return null;
  return {
    currentVersion: Application.nativeApplicationVersion ?? '0',
    availableVersion: 'forced',
    storeUrl:
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/app/id6761648165'
        : 'market://details?id=com.oneplan.android',
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  };
}

export async function checkForRequiredUpdate(): Promise<UpdateInfo | null> {
  const forced = forcedGateOverride();
  if (forced) return forced;
  const current = Application.nativeApplicationVersion;
  const id = Application.applicationId;
  if (!current || !id) return null;
  if (Platform.OS === 'ios') return checkIosStoreVersion(id, current);
  if (Platform.OS === 'android') return checkAndroidUpdate(id, current);
  return null;
}

/** Opens the store. On Android tries the Play IMMEDIATE flow first, then falls back to the URL. */
export async function openStoreForUpdate(info: UpdateInfo): Promise<void> {
  if (info.platform === 'android') {
    try {
      const { default: SpInAppUpdates, IAUUpdateKind } =
        await import('sp-react-native-in-app-updates');
      await new SpInAppUpdates(false).startUpdate({ updateType: IAUUpdateKind.IMMEDIATE });
      return;
    } catch {
      // fall through to the store URL
    }
    try {
      await Linking.openURL(info.storeUrl);
      return;
    } catch {
      await Linking.openURL(
        `https://play.google.com/store/apps/details?id=${info.storeUrl.split('id=')[1] ?? ''}`,
      );
      return;
    }
  }
  await Linking.openURL(info.storeUrl);
}

/**
 * Published copy of the root layout's gate result so other screens can ask
 * "is the update wall up?" without firing a second store lookup.
 */
let gateBlocked = false;
const gateListeners = new Set<() => void>();

function publishGate(blocked: boolean): void {
  if (gateBlocked === blocked) return;
  gateBlocked = blocked;
  for (const listener of gateListeners) listener();
}

/** Reactive "the forced-update wall is showing" flag (false until the check resolves). */
export function useVersionGateBlocked(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      gateListeners.add(onChange);
      return () => gateListeners.delete(onChange);
    },
    () => gateBlocked,
    () => gateBlocked,
  );
}

/** Test seam — resets the published flag between cases. */
export function _resetVersionGateForTests(): void {
  gateBlocked = false;
  gateListeners.clear();
}

/** `null` while checking or when no update is required — the app never blocks on a pending check. */
export function useVersionGate(enabled = true): UpdateInfo | null {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    checkForRequiredUpdate().then((r) => {
      if (!cancelled && r) {
        setInfo(r);
        publishGate(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return enabled ? info : null;
}
