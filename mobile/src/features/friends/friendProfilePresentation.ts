/**
 * Stack options for the friend-profile route. iOS presents `FriendProfileView` in a `.sheet`
 * (`FriendsListView.swift`); Android's `modal` is a plain full-screen push, so it gets a
 * full-height native `formSheet` instead. Used by the root `friend-profile/[userId]` route
 * (friends list + trip members), so pushes from inside it land on top of the sheet.
 */
import type { Stack } from 'expo-router';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

type ScreenOptions = NonNullable<ComponentProps<typeof Stack.Screen>['options']>;
type NativeStackNavigationOptions = Exclude<ScreenOptions, (...args: never[]) => unknown>;

export const friendProfileSheetOptions: NativeStackNavigationOptions =
  Platform.select<NativeStackNavigationOptions>({
    android: { presentation: 'formSheet', sheetAllowedDetents: [1.0], sheetCornerRadius: 24 },
    default: { presentation: 'modal' },
  });
