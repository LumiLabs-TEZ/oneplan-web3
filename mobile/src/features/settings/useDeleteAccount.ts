/**
 * Biometric-gated account deletion — port of `SettingView.swift:259-270`'s delete-account alert
 * plus `AuthService.deleteAccount()` (`ios/OnePlan/OnePlan/Services/AuthService.swift:256-307`).
 * Flow: confirm alert -> biometrics/passcode gate (`confirmWithBiometrics`) -> `DELETE
 * /auth/account` (`deleteAccount`). Every non-`'ok'` biometric outcome and every API failure ends
 * in an `Alert`, never a thrown error — the caller (a settings row) has nothing to catch.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { deleteAccount as deleteAccountRequest } from '@/auth/deleteAccount';
import { useAppLanguage } from '@/i18n';
import { confirmWithBiometrics as confirmWithBiometricsRequest } from '@/native/biometrics';
import { requireOnline } from '@/offline/guardOnline';

export interface UseDeleteAccountDeps {
  confirmWithBiometrics?: typeof confirmWithBiometricsRequest;
  deleteAccount?: typeof deleteAccountRequest;
}

export interface UseDeleteAccountResult {
  /** Shows the confirmation alert; the rest of the flow runs from its destructive button. */
  run: () => void;
  pending: boolean;
}

export function useDeleteAccount(deps: UseDeleteAccountDeps = {}): UseDeleteAccountResult {
  useAppLanguage();
  const { t } = useTranslation();
  const [pending, setPending] = useState(false);
  const confirmBiometrics = deps.confirmWithBiometrics ?? confirmWithBiometricsRequest;
  const performDelete = deps.deleteAccount ?? deleteAccountRequest;

  const handleConfirm = async () => {
    setPending(true);
    try {
      const outcome = await confirmBiometrics(t('Confirm to permanently delete your account'), {
        cancelLabel: t('Cancel'),
      });

      switch (outcome) {
        case 'ok':
          await performDelete();
          break;
        case 'unavailable':
          Alert.alert(t('Authentication not available on this device'));
          break;
        case 'failed':
          Alert.alert(t('Authentication failed'));
          break;
        case 'cancelled':
          break;
      }
    } catch {
      Alert.alert(t('Failed to delete account. Please try again.'));
    } finally {
      setPending(false);
    }
  };

  const run = () => {
    if (!requireOnline(t)) return;
    Alert.alert(
      t('Delete Account?'),
      t(
        'This action is permanent. All your trips, expenses, photos, and data will be deleted forever.',
      ),
      [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Delete'), style: 'destructive', onPress: () => void handleConfirm() },
      ],
    );
  };

  return { run, pending };
}
