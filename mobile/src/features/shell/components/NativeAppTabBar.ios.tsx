/**
 * iOS: the SwiftUI `MorphingTabBar` + FAB hosted by `modules/parity-ui` (`AppTabBarView.swift`),
 * so the segmented-control glass lens and the morph are the system ones.
 */
import { requireNativeView } from 'expo';

import type { NativeAppTabBarProps } from './NativeAppTabBar.types';

// Look up the view itself, not just the module: Expo Go, Jest and dev clients built before
// `AppTabBarView` existed have no such view, so they fall back to the JS bar. Jest's expo stub
// throws "Method not implemented" from `getViewConfig`, which also means "unavailable".
function hasNativeView(): boolean {
  try {
    return globalThis.expo?.getViewConfig?.('ParityUI', 'AppTabBarView') != null;
  } catch {
    return false;
  }
}

export const nativeTabBarAvailable = hasNativeView();

export const NativeAppTabBar = nativeTabBarAvailable
  ? requireNativeView<NativeAppTabBarProps>('ParityUI', 'AppTabBarView')
  : () => null;
