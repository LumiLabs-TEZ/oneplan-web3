/** Port of `FriendProfileHeaderSection` (`FriendProfileView.swift:339-424`). */
import { Platform, StyleSheet, Text, View } from 'react-native';

import { Avatar, ProAvatar, ProBadge } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import type { FriendProfileAction } from '../helpers/requestActions';
import type { FriendRequestStatus } from '../types';
import { FriendActionArea } from './FriendActionArea';

/** Locked UI mock (Phase 4 constraints) — never the real friend code. */
export const LOCKED_FRIEND_CODE_LABEL = 'OP-2006-2710';

export interface FriendProfileHeaderProps {
  displayName: string;
  avatarUrl?: string | null;
  friendCode?: string | null;
  requestStatus: FriendRequestStatus;
  isPerformingAction: boolean;
  isPro: boolean;
  onAction: (action: FriendProfileAction) => void;
}

export function FriendProfileHeader({
  displayName,
  avatarUrl,
  friendCode,
  requestStatus,
  isPerformingAction,
  isPro,
  onAction,
}: FriendProfileHeaderProps) {
  return (
    <View style={styles.root}>
      {/* Same `AvatarProPlaceholder` look as `ProfileAvatar`: ring + PRO tab for Pro. */}
      {isPro ? <ProAvatar uri={avatarUrl} size={120} /> : <Avatar uri={avatarUrl} size={120} />}

      <View style={styles.nameBlock}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
          {isPro ? <ProBadge /> : null}
        </View>

        {friendCode != null ? (
          <Text style={styles.friendCode}>{LOCKED_FRIEND_CODE_LABEL}</Text>
        ) : null}
      </View>

      {/* No friend code to add-request against — hide the "Add friend" button rather than
          wiring a mutation that has nothing to send (brief: "if friendCode is null, hide the
          button"). */}
      {requestStatus === 'none' && friendCode == null ? null : (
        <FriendActionArea
          status={requestStatus}
          isPerformingAction={isPerformingAction}
          onAction={onAction}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', gap: 19 },
  nameBlock: { alignItems: 'center', gap: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  name: { ...beVietnamPro(24, 'medium'), color: colors.contentB },
  friendCode: {
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    color: colors.contentM,
    letterSpacing: 0.72,
  },
});
