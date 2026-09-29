/**
 * Member ellipsis-menu — port of `MemberList.swift`'s `.confirmationDialog(entry.name, …)`
 * (`feat/web3-version`): role toggle, plus a host-only vault-leave action when one applies.
 * Same `ActionSheetIOS` (iOS) / `Alert` with buttons (Android) split as `removeFriendPrompt.ts`
 * — RN has no `.confirmationDialog` equivalent.
 */
import type { TFunction } from 'i18next';
import { ActionSheetIOS, Alert, Platform } from 'react-native';

export type MemberRoleMenuPlatform = 'ios' | 'android';

export interface MemberRoleMenuOptions {
  /** "Make co-host" / "Remove as co-host". */
  roleActionTitle: string;
  onSelectRole: () => void;
  /** "Confirm leave" / "Mark paid for leave" — vault trips only; omit to hide the row. */
  clearVaultLeaveTitle?: string;
  onSelectClearVaultLeave?: () => void;
}

export function presentMemberRoleMenu(
  t: TFunction,
  displayName: string,
  options: MemberRoleMenuOptions,
  platform: MemberRoleMenuPlatform = Platform.OS === 'ios' ? 'ios' : 'android',
): void {
  const { roleActionTitle, onSelectRole, clearVaultLeaveTitle, onSelectClearVaultLeave } = options;
  const message = t('A co-host can approve payments over the trip limit.');
  const showsClear = clearVaultLeaveTitle != null && onSelectClearVaultLeave != null;

  if (platform === 'ios') {
    const actionOptions = showsClear
      ? [roleActionTitle, clearVaultLeaveTitle, t('Cancel')]
      : [roleActionTitle, t('Cancel')];
    ActionSheetIOS.showActionSheetWithOptions(
      { title: displayName, message, options: actionOptions, cancelButtonIndex: actionOptions.length - 1 },
      (index) => {
        if (index === 0) onSelectRole();
        else if (showsClear && index === 1) onSelectClearVaultLeave?.();
      },
    );
    return;
  }

  const buttons = [
    { text: roleActionTitle, onPress: onSelectRole },
    ...(showsClear ? [{ text: clearVaultLeaveTitle, onPress: onSelectClearVaultLeave }] : []),
    { text: t('Cancel'), style: 'cancel' as const },
  ];
  Alert.alert(displayName, message, buttons);
}
