/**
 * Tabs shell — replaces `MainView.swift`. Custom `AppTabBar` (+ FAB) and shared `AppHeader`;
 * scenes cross-fade on switch (≈ `.easeInOut(0.22)` + `.transition(.opacity)`).
 */
import { Tabs } from 'expo-router';
import { BlurTargetView } from 'expo-blur';
import { createRef, useCallback, useMemo, useState, type RefObject } from 'react';
import { View } from 'react-native';
import {
  GlassBackdropContext,
  type GlassBackdropContextValue,
} from '@/ui/components/GlassBackdrop';

import { AppHeader } from '@/features/shell/components/AppHeader';
import { AppTabBar } from '@/features/shell/components/AppTabBar';
import { tabBackdrop } from '@/features/shell/tabBackdrop';
import { APP_TABS, isAppTab } from '@/features/shell/tabs';
import { useRootModalPresenter } from '@/features/shell/useRootModalPresenter';
import { colors } from '@/ui/theme';

export default function TabsLayout() {
  // Auto-presents the root modals over the tabs — free trial → friend code → friend request →
  // trip invite (iOS `OnePlanApp.presentNextRootModalIfNeeded`).
  useRootModalPresenter();
  const [backdrops] = useState(
    () =>
      Object.fromEntries(APP_TABS.map((tab) => [tab.name, createRef<View>()])) as Record<
        string,
        RefObject<View | null>
      >,
  );
  const [attached, setAttached] = useState<Record<string, boolean>>({});
  const attachmentCallbacks = useMemo(
    () =>
      Object.fromEntries(
        APP_TABS.map((tab) => [
          tab.name,
          (view: View | null) => {
            const target = backdrops[tab.name];
            if (target) {
              target.current = view;
              setAttached((previous) => {
                const next = Boolean(view);
                return previous[tab.name] === next ? previous : { ...previous, [tab.name]: next };
              });
            }
          },
        ]),
      ) as Record<string, (view: View | null) => void>,
    [backdrops],
  );
  const contextValue = useCallback(
    (name: string, focused: boolean): GlassBackdropContextValue | undefined =>
      tabBackdrop(backdrops[name], attached[name] === true, focused),
    [attached, backdrops],
  );

  return (
    <Tabs
      // Keep inactive scenes attached: a detached scene re-attaches mid cross-fade and
      // `expo-glass-effect` then initialises a blank material (the AppHeader capsules render
      // transparent until a remount). iOS tab bars likewise keep visited tabs in the hierarchy.
      detachInactiveScreens={false}
      tabBar={(props) => (
        <GlassBackdropContext.Provider
          value={contextValue(props.state.routes[props.state.index]?.name ?? 'home', true)}
        >
          <AppTabBar {...props} />
        </GlassBackdropContext.Provider>
      )}
      screenLayout={({ children, route }) => (
        <BlurTargetView
          ref={attachmentCallbacks[route.name] as unknown as RefObject<View | null>}
          style={{ flex: 1 }}
        >
          {/* Opaque on purpose: Dimezis clears each blur frame with the window background (black,
              from the splash theme), so transparent target pixels blur to grey behind the glass.
              The fill must be a child — Android `BlurTargetView` is a host wrapping the real
              Dimezis `BlurTarget`, and only that inner view's children are captured, never the
              host's own background. */}
          <View collapsable={false} style={{ flex: 1, backgroundColor: colors.background }}>
            {children}
          </View>
        </BlurTargetView>
      )}
      screenOptions={({ route, navigation }) => ({
        header: () => (
          <GlassBackdropContext.Provider value={contextValue(route.name, navigation.isFocused())}>
            <AppHeader tab={isAppTab(route.name) ? route.name : 'home'} />
          </GlassBackdropContext.Provider>
        ),
        // Floating header on every tab (iOS toolbar over scrolling content); each tab pads its
        // content via `useTabContentInsets()`. Market also draws `MarketTopGlow` behind it.
        headerTransparent: true,
        sceneStyle: { backgroundColor: colors.background },
        animation: 'fade',
        lazy: true,
      })}
    >
      {APP_TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: tab.title }} />
      ))}
    </Tabs>
  );
}
