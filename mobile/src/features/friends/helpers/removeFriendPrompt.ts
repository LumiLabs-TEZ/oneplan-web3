/**
 * Two-step "Remove friend" prompt for the friend-profile header ellipsis menu — port of
 * `FriendProfileToolbarMenu` (`Menu` → `Remove friend` button) + the `.alert("Remove friend?", …)`
 * confirm (`FriendProfileView.swift:123-132, 301-337`). RN has no `Menu`/`.alert(isPresented:)`
 * equivalent, so the first step becomes `ActionSheetIOS` (iOS) / `Alert` with buttons (Android),
 * and the second step is always `Alert.alert`.
 */
import type { TFunction } from 'i18next';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type RemoveFriendPlatform = 'ios' | 'android';

/**
 * Ellipsis-menu step — its only action is "Remove friend"; selecting it calls `onSelectRemove`.
 * Carries the confirm alert's title + description so the sheet explains what will happen.
 */
export function presentFriendProfileMenu(
  t: TFunction,
  displayName: string,
  onSelectRemove: () => void,
  platform: RemoveFriendPlatform = Platform.OS === 'ios' ? 'ios' : 'android',
): void {
  const title = t('Remove friend?');
  const message = t('%@ will be removed from your friends list.', { 0: displayName });
  if (platform === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        message,
        options: [t('Remove friend'), t('Cancel')],
        destructiveButtonIndex: 0,
        cancelButtonIndex: 1,
      },
      (index) => {
        if (index === 0) onSelectRemove();
      },
    );
    return;
  }
  Alert.alert(title, message, [
    { text: t('Remove friend'), style: 'destructive', onPress: onSelectRemove },
    { text: t('Cancel'), style: 'cancel' },
  ]);
}

/** Confirm step — `t('%@ will be removed from your friends list.', { 0: displayName })`. */
export function confirmRemoveFriend(
  t: TFunction,
  displayName: string,
  onConfirm: () => void,
): void {
  Alert.alert(
    t('Remove friend?'),
    t('%@ will be removed from your friends list.', { 0: displayName }),
    [
      { text: t('Cancel'), style: 'cancel' },
      { text: t('Remove'), style: 'destructive', onPress: onConfirm },
    ],
  );
}
