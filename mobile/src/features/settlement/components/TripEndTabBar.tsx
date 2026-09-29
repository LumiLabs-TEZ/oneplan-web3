/**
 * Bottom tab bar of `TripEndView.swift` (History / Breakdown) — the same bar as Home, minus the
 * FAB: on iOS the native SwiftUI bar (`NativeAppTabBar`), elsewhere the JS `MorphingTabBar`
 * (glass lens, drag across tabs, selection haptic). Tint = `BlueBase`.
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { BAR_HEIGHT, MorphingTabBar } from '@/features/shell/components/MorphingTabBar';
import {
  NativeAppTabBar,
  nativeTabBarAvailable,
} from '@/features/shell/components/NativeAppTabBar';
import { useAppLanguage } from '@/i18n';
import { SFSymbol, type SFSymbolProps } from '@/ui/components/SFSymbol';
import { colors } from '@/ui/theme';

export type TripEndTab = 'history' | 'breakdown';

/** JS segment width — room for the longest label ("Breakdown") plus the lens's side padding. */
const SEGMENT = 112;
/** `MainView` ignores the bottom safe area and pads a flat 25, like `AppTabBar`. */
const BOTTOM_PADDING = 25;

interface TabDef {
  value: TripEndTab;
  title: string;
  symbol: string;
  fallback: SFSymbolProps['fallback'];
}

const TABS: readonly TabDef[] = [
  {
    value: 'history',
    title: 'History',
    symbol: 'clock.arrow.trianglehead.counterclockwise.rotate.90',
    fallback: 'time-outline',
  },
  {
    value: 'breakdown',
    title: 'Breakdown',
    symbol: 'chart.bar.xaxis',
    fallback: 'bar-chart-outline',
  },
];

function symbolIcon(tab: TabDef, color: string) {
  function Icon({ width }: { width: number; height: number }) {
    return <SFSymbol name={tab.symbol} fallback={tab.fallback} size={width} color={color} />;
  }
  return Icon;
}

/** `MorphingTabBar` icons: grey / blue like the Home tab SVGs. */
const JS_ICONS = TABS.map((tab) => ({
  icon: symbolIcon(tab, colors.contentL),
  iconActive: symbolIcon(tab, colors.blueBase),
}));

/** Total height of the floating bar — the scroll content pads past it. */
export function tripEndTabBarHeight(): number {
  return BAR_HEIGHT + BOTTOM_PADDING;
}

export interface TripEndTabBarProps {
  value: TripEndTab;
  onChange: (tab: TripEndTab) => void;
  /** Web3 vault trips rename the second tab "Settlement" — classic trips keep "Breakdown". */
  breakdownLabel?: string;
}

export function TripEndTabBar({ value, onChange, breakdownLabel }: TripEndTabBarProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.value === value),
  );
  const select = (index: number) => {
    const tab = TABS[index];
    if (tab && tab.value !== value) onChange(tab.value);
  };
  const label = (tab: TabDef) =>
    tab.value === 'breakdown' ? (breakdownLabel ?? t(tab.title)) : t(tab.title);

  if (nativeTabBarAvailable) {
    return (
      <View
        pointerEvents="box-none"
        testID="trip-end-tabs"
        style={[styles.native, { height: tripEndTabBarHeight() }]}
      >
        <NativeAppTabBar
          style={StyleSheet.absoluteFill}
          tabs={TABS.map((tab) => ({
            key: tab.value,
            title: label(tab),
            icon: tab.symbol,
            selectedIcon: tab.symbol,
          }))}
          actions={[]}
          selectedIndex={activeIndex}
          expanded={false}
          showsFab={false}
          bottomPadding={BOTTOM_PADDING}
          onSelectTab={(e) => select(e.nativeEvent.index)}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" testID="trip-end-tabs" style={styles.wrap}>
      <View style={styles.bar}>
        <MorphingTabBar
          tabs={TABS.map((tab, index) => ({
            name: tab.value,
            label: label(tab),
            ...JS_ICONS[index]!,
          }))}
          activeIndex={activeIndex}
          onSelect={select}
          expanded={false}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  native: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    paddingBottom: BOTTOM_PADDING,
  },
  // Row so the pill's `flex: 1` fills the width (as beside Home's FAB) and its animated height
  // stays its own.
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: SEGMENT * TABS.length + 4,
    height: BAR_HEIGHT,
  },
});
