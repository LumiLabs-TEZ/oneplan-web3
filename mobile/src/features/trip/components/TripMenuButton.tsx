/**
 * The trip-detail ellipsis menu (native UIMenu on iOS, SwiftUI-styled popover on Android) — port
 * of SwiftUI's `Menu { … }` in `TripDetailView.swift:766-918`, same `AppMenuView` approach as the
 * marketplace filter chips. Rows come from `tripMenuItems`.
 *
 * The trigger (`children`) must be a plain view, not a `Pressable`: the native menu owns the tap.
 */
import type { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Platform } from 'react-native';

import type { TripMenuItem, TripMenuItemId } from '@/features/trip/helpers/tripMenu';
import { AppMenuView, type AppMenuAction } from '@/ui/components';

/** SF Symbols of the iOS `Label(…, systemImage:)` rows. */
const SF_SYMBOLS: Record<TripMenuItemId, string> = {
  groupCurrency: 'dollarsign.circle',
  localCurrency: 'airplane',
  tripDates: 'calendar',
  startTrip: 'play.fill',
  endTrip: 'hand.wave',
  deleteTrip: 'trash',
  leaveGroup: 'rectangle.portrait.and.arrow.right',
};

/** Ionicons stand-ins for the Android popover. */
const ANDROID_ICONS: Record<TripMenuItemId, ComponentProps<typeof Ionicons>['name']> = {
  groupCurrency: 'cash-outline',
  localCurrency: 'airplane-outline',
  tripDates: 'calendar-outline',
  startTrip: 'play',
  endTrip: 'hand-left-outline',
  deleteTrip: 'trash-outline',
  leaveGroup: 'log-out-outline',
};

/**
 * Icon tints. Required on iOS: the new-arch bridge always forwards `imageColor`, and an unset
 * one arrives as `0` — fully transparent — so the SF Symbols would be invisible. Values are the
 * system `label` / `systemRed` a SwiftUI `Menu` uses.
 */
const ICON_COLOR = '#000000';
const DESTRUCTIVE_ICON_COLOR = '#FF3B30';

const TRIP_MENU_ITEM_IDS = new Set<string>(Object.keys(SF_SYMBOLS));

export function isTripMenuItemId(id: string): id is TripMenuItemId {
  return TRIP_MENU_ITEM_IDS.has(id);
}

/**
 * Maps rows to menu actions. Each `divider` row starts a new inline group, drawn with a separator
 * (the SwiftUI `Divider()`) by UIMenu and the Android popover alike. iOS rows carry SF Symbols,
 * Android rows Ionicons.
 */
export function tripMenuActions(
  items: readonly TripMenuItem[],
  os: typeof Platform.OS = Platform.OS,
): AppMenuAction[] {
  const toAction = (item: TripMenuItem): AppMenuAction => ({
    id: item.id,
    title: item.label,
    ...(os === 'ios'
      ? {
          image: SF_SYMBOLS[item.id],
          imageColor: item.destructive ? DESTRUCTIVE_ICON_COLOR : ICON_COLOR,
        }
      : { androidIcon: ANDROID_ICONS[item.id] }),
    ...(item.destructive ? { attributes: { destructive: true } } : null),
  });

  const groups: TripMenuItem[][] = [];
  for (const item of items) {
    if (item.divider || groups.length === 0) groups.push([item]);
    else groups[groups.length - 1]!.push(item);
  }
  if (groups.length === 1) return groups[0]!.map(toAction);
  return groups.map((group, index) => ({
    id: `group-${index}`,
    title: '',
    displayInline: true,
    subactions: group.map(toAction),
  }));
}

export interface TripMenuButtonProps {
  items: readonly TripMenuItem[];
  onSelect: (id: TripMenuItemId) => void;
  children: ReactNode;
  testID?: string;
}

export function TripMenuButton({ items, onSelect, children, testID }: TripMenuButtonProps) {
  return (
    <AppMenuView
      testID={testID}
      actions={tripMenuActions(items)}
      onPressAction={({ nativeEvent }) => {
        if (isTripMenuItemId(nativeEvent.event)) onSelect(nativeEvent.event);
      }}
    >
      {children}
    </AppMenuView>
  );
}
