/**
 * Friend-profile action buttons — port of `FriendProfileHeaderSection.actionArea(for:)`
 * (`FriendProfileView.swift:391-423`). `actionsFor` decides which buttons show; this component
 * just lays them out and wires taps.
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { Button } from '@/ui/components';

import { actionsFor, type FriendProfileAction } from '../helpers/requestActions';
import type { FriendRequestStatus } from '../types';

export interface FriendActionAreaProps {
  status: FriendRequestStatus;
  isPerformingAction: boolean;
  onAction: (action: FriendProfileAction) => void;
}

export function FriendActionArea({ status, isPerformingAction, onAction }: FriendActionAreaProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const actions = actionsFor(status);
  if (actions.length === 0) return null;

  if (actions[0] === 'add') {
    return (
      <Button
        variant="primary"
        title={t('Add friend')}
        disabled={isPerformingAction}
        onPress={() => onAction('add')}
        style={styles.addButton}
        testID="friend-action-add"
      />
    );
  }

  if (actions[0] === 'cancel') {
    return (
      <Button
        variant="primary"
        title={t('Cancel request')}
        disabled={isPerformingAction}
        onPress={() => onAction('cancel')}
        style={styles.cancelButton}
        testID="friend-action-cancel"
      />
    );
  }

  return (
    <View style={styles.row}>
      <Button
        variant="primary"
        title={t('Accept')}
        disabled={isPerformingAction}
        onPress={() => onAction('accept')}
        style={styles.flexButton}
        testID="friend-action-accept"
      />
      <Button
        variant="secondary"
        title={t('Decline')}
        disabled={isPerformingAction}
        onPress={() => onAction('decline')}
        style={styles.flexButton}
        testID="friend-action-decline"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  addButton: { width: 140 },
  cancelButton: { width: 180 },
  row: { flexDirection: 'row', gap: 12, maxWidth: 300, alignSelf: 'center' },
  flexButton: { flex: 1 },
});
