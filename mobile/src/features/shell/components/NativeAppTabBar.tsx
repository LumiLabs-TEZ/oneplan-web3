/** Android / web: no native tab bar — `AppTabBar` renders the JS `MorphingTabBar`. */
import type { NativeAppTabBarProps } from './NativeAppTabBar.types';

export const nativeTabBarAvailable = false;

export function NativeAppTabBar(_props: NativeAppTabBarProps): null {
  return null;
}
