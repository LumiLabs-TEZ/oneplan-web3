/**
 * Custom tab bar + FAB row — port of `MorphingTabBar.swift` and the FAB block in
 * `MainView.swift:166-192` (padding h20 / b25 + safe area, gap 12). On iOS the SwiftUI bar
 * itself runs natively (`NativeAppTabBar`); elsewhere the JS `MorphingTabBar` imitates it.
 * Either way the FAB morphs the pill into the quick-action card.
 */
import type { Tabs } from 'expo-router';
import { type ComponentProps, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { QUICK_ACTIONS, type QuickActionKind } from '@/features/shell/quickActions';
import { APP_TABS } from '@/features/shell/tabs';
import { useQuickActionHandler } from '@/features/shell/useQuickActionHandler';
import { useAppLanguage } from '@/i18n';

import { Fab } from './Fab';
import { BAR_HEIGHT, MorphingTabBar } from './MorphingTabBar';
import { NativeAppTabBar, nativeTabBarAvailable } from './NativeAppTabBar';
import { QuickActionsMenu } from './QuickActionsMenu';

/** Room above the pill for the expanded quick-action card and the morph's squash/lift. */
const NATIVE_EXPANSION_ROOM = 280;

/**
 * Bottom padding under the pill. `MainView` ignores the bottom safe area and pads a flat 25, so
 * the bar sits 25pt above the screen edge (over the home indicator) regardless of the inset.
 */
const BAR_BOTTOM_PADDING = 25;

/** Total height of the floating (absolute) tab bar — scenes pad their content past it. */
export function appTabBarHeight(): number {
  return BAR_HEIGHT + BAR_BOTTOM_PADDING;
}

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

export function AppTabBar({ state, navigation }: TabBarProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const activeName = state.routes[state.index]?.name ?? 'home';
  const activeIndex = Math.max(
    0,
    APP_TABS.findIndex((tab) => tab.name === activeName),
  );

  const close = useCallback(() => setExpanded(false), []);
  const handleAction = useQuickActionHandler({ onClose: close });

  const select = (index: number) => {
    const tab = APP_TABS[index];
    if (!tab || tab.name === activeName) return;
    const route = state.routes.find((r) => r.name === tab.name);
    if (route) {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (event.defaultPrevented) return;
    }
    navigation.navigate(tab.name);
  };

  const tabs = useMemo(() => APP_TABS.map((tab) => ({ ...tab, label: t(tab.title) })), [t]);

  if (nativeTabBarAvailable) {
    return (
      <View
        pointerEvents="box-none"
        style={[styles.native, { height: appTabBarHeight() + NATIVE_EXPANSION_ROOM }]}
      >
        <NativeAppTabBar
          style={StyleSheet.absoluteFill}
          tabs={tabs.map((tab) => ({
            key: tab.name,
            title: tab.label,
            icon: tab.nativeIcon,
            selectedIcon: tab.nativeIconActive,
          }))}
          actions={QUICK_ACTIONS.map((action) => ({
            id: action.id,
            title: t(action.title),
            symbol: action.symbol,
            pro: action.proOnly,
          }))}
          selectedIndex={activeIndex}
          expanded={expanded}
          bottomPadding={BAR_BOTTOM_PADDING}
          onSelectTab={(e) => select(e.nativeEvent.index)}
          onToggleExpanded={(e) => setExpanded(e.nativeEvent.expanded)}
          onAction={(e) => handleAction(e.nativeEvent.id as QuickActionKind)}
        />
      </View>
    );
  }

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { paddingBottom: BAR_BOTTOM_PADDING }]}>
      <View pointerEvents="box-none" style={styles.row}>
        <MorphingTabBar tabs={tabs} activeIndex={activeIndex} onSelect={select} expanded={expanded}>
          <QuickActionsMenu onClose={close} />
        </MorphingTabBar>
        <Fab expanded={expanded} onPress={() => setExpanded((v) => !v)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  native: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
});
