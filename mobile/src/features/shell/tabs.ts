/**
 * Bottom tabs — port of `enum AppTab` in `ios/OnePlan/OnePlan/View/MainView.swift:13-44`.
 * iOS names the Board case `.chat` (legacy); RN uses `board`. `title` is an i18n key.
 */
import { svg } from '@/ui/assets';

export type AppTab = 'home' | 'trip' | 'board' | 'market';

export interface AppTabDef {
  name: AppTab;
  title: string;
  icon: (typeof svg.tab)[keyof typeof svg.tab];
  iconActive: (typeof svg.tab)[keyof typeof svg.tab];
  /** Asset names bundled in `modules/parity-ui/ios/Assets.xcassets` (`AppTab.symbolImage`). */
  nativeIcon: string;
  nativeIconActive: string;
}

export const APP_TABS: readonly AppTabDef[] = [
  {
    name: 'home',
    title: 'Home',
    icon: svg.tab.home,
    iconActive: svg.tab.homeBlue,
    nativeIcon: 'home',
    nativeIconActive: 'homeBlue',
  },
  {
    name: 'trip',
    title: 'Trip',
    icon: svg.tab.planet,
    iconActive: svg.tab.planetBlue,
    nativeIcon: 'planet',
    nativeIconActive: 'planetBlue',
  },
  {
    name: 'board',
    title: 'Board',
    icon: svg.tab.board,
    iconActive: svg.tab.boardBlue,
    nativeIcon: 'board',
    nativeIconActive: 'boardBlue',
  },
  {
    name: 'market',
    title: 'Market',
    icon: svg.tab.suitcase,
    iconActive: svg.tab.suitcaseBlue,
    nativeIcon: 'suitcase',
    nativeIconActive: 'suitcaseBlue',
  },
];

export function isAppTab(name: string): name is AppTab {
  return APP_TABS.some((t) => t.name === name);
}
