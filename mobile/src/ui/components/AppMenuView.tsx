/**
 * Cross-platform menu trigger. iOS keeps the native UIMenu (`@react-native-menu/menu`), which is
 * exactly SwiftUI's `Menu`; Android swaps in `AppMenuView.android.tsx`, a JS popover styled like
 * the iOS 26 menu instead of the Material PopupMenu. Both take the same props.
 */
import { MenuView, type MenuAction } from '@react-native-menu/menu';
import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

export type AppMenuAction = Omit<MenuAction, 'subactions'> & {
  /** Ionicons glyph drawn on Android (the iOS menu uses `image`, an SF Symbol). */
  androidIcon?: ComponentProps<typeof Ionicons>['name'];
  subactions?: AppMenuAction[];
};

export interface AppMenuViewProps {
  actions: AppMenuAction[];
  onPressAction?: (event: { nativeEvent: { event: string } }) => void;
  testID?: string;
  style?: StyleProp<ViewStyle>;
  /** The trigger. Must be a plain view, not a `Pressable`: the menu owns the tap. */
  children: ReactNode;
}

/** Drops the Android-only `androidIcon` before handing actions to the native bridge. */
function toNative({ androidIcon: _icon, subactions, ...action }: AppMenuAction): MenuAction {
  return subactions ? { ...action, subactions: subactions.map(toNative) } : action;
}

export function AppMenuView({ actions, ...rest }: AppMenuViewProps) {
  return <MenuView {...rest} actions={actions.map(toNative)} />;
}
