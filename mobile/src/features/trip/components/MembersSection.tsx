/**
 * Trip Members tab body — port of `TripDetailView.membersTab` + `Component/Common/MemberList.swift`
 * (`TripDetailView.swift:1339-1395`). No remove-member action, as on iOS; your own row reads
 * "Name (You)".
 *
 * Role badges + the co-host/vault-leave ellipsis menu (`showsRoleAction: isCreator && !isSelf`,
 * `TripDetailView.swift:1830-1846`) are web3-only additions — gated behind `useWeb3Enabled()` so
 * this section is pixel-identical to develop with the flag off, regardless of `isCreator`
 * (including the Host/Co-host pill and its `nameRow` wrapper — see `showsRoleBadge`).
 */
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { mutationErrorMessage } from '@/api/mutationError';
import { useFriends, mutualLabel } from '@/features/friends/api/queries';
import { useIsPro } from '@/features/me/useMe';
import { type MemberEntry, memberEntries } from '@/features/trip/helpers/memberEntries';
import type { TripMemberDto } from '@/features/trip/types';
import { presentMemberRoleMenu } from '@/features/vault/helpers/memberRoleMenu';
import { useClearVaultLeave, useConfirmVaultLeave, useVaultLeaveRequests } from '@/features/vault/api/leave';
import { useSetMemberRole } from '@/features/vault/api/roles';
import { useWeb3Enabled } from '@/features/vault/web3Flag';
import { VaultLeaveHostSheet, type VaultLeaveHostSheetRef } from '@/features/vault/screens';
import { useAppLanguage } from '@/i18n';
import { Avatar, ProAvatar, SFSymbol } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const AVATAR_SIZE = 48;

/**
 * A `Pressable` with no press handler at all doesn't reliably claim the responder, which
 * would let a tap fall through to an ancestor `Pressable` (the row's own `onPress`). Always
 * passing a handler — even this no-op for the disabled `Friend` pill — keeps it a dead zone.
 */
function noop() {
  /* no-op: disabled trailing pill swallows the tap */
}

export interface MembersSectionProps {
  members: TripMemberDto[];
  currentUserId: number | undefined;
  /** Required only to drive the role/vault-leave menu — safe to omit for a read-only list. */
  tripId?: number;
  /** Shows the ellipsis menu on every non-self row (`TripDetailView`'s `isCreator`). */
  isCreator?: boolean;
  /** Adds the "Mark paid for leave" / "Confirm leave" menu item — vault trips only. */
  hasVault?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function MembersSection({
  members,
  currentUserId,
  tripId,
  isCreator = false,
  hasVault = false,
  style,
}: MembersSectionProps) {
  const { t } = useTranslation();
  useAppLanguage();
  const web3Enabled = useWeb3Enabled(tripId);
  const friendsQuery = useFriends();
  const currentUserIsPro = useIsPro();
  const hostSheetRef = useRef<VaultLeaveHostSheetRef>(null);
  const [hostSheetUserId, setHostSheetUserId] = useState<number | null>(null);

  const showsMenu = web3Enabled && isCreator && tripId != null;

  const leaveRequests = useVaultLeaveRequests(tripId ?? -1, {
    enabled: showsMenu && hasVault,
  });
  const setRole = useSetMemberRole(tripId ?? -1);
  const clearVaultLeave = useClearVaultLeave(tripId ?? -1);
  const confirmVaultLeave = useConfirmVaultLeave(tripId ?? -1);

  const entries = memberEntries(members, {
    currentUserId: currentUserId ?? -1,
    friends: friendsQuery.data ?? [],
    currentUserIsPro,
  });

  const pendingRequestByUserId = new Map((leaveRequests.data ?? []).map((r) => [r.userId, r]));
  const hostSheetRequest = hostSheetUserId != null ? (pendingRequestByUserId.get(hostSheetUserId) ?? null) : null;

  const handleRoleMenu = (entry: MemberEntry) => {
    if (!showsMenu) return;
    const isCoHost = entry.role === 'CO_HOST';
    const pending = hasVault ? pendingRequestByUserId.get(entry.userId) : undefined;

    presentMemberRoleMenu(t, entry.displayName, {
      roleActionTitle: isCoHost ? t('Remove as co-host') : t('Make co-host'),
      onSelectRole: () => {
        setRole.mutate(
          { userId: entry.userId, role: isCoHost ? 'MEMBER' : 'CO_HOST' },
          {
            onError: (err) =>
              Alert.alert(mutationErrorMessage(err, t("Failed to change the member's role"))),
          },
        );
      },
      clearVaultLeaveTitle: hasVault
        ? pending
          ? t('Confirm leave')
          : t('Mark paid for leave')
        : undefined,
      onSelectClearVaultLeave: hasVault
        ? () => {
            if (pending) {
              setHostSheetUserId(entry.userId);
              hostSheetRef.current?.present();
              return;
            }
            clearVaultLeave.mutate(entry.userId, {
              onError: (err) =>
                Alert.alert(mutationErrorMessage(err, t('Failed to mark member paid'))),
            });
          }
        : undefined,
    });
  };

  return (
    // No section header, as on iOS — Invite lives in the trip header's person+ button.
    <View style={[styles.card, style]}>
      {entries.map((entry) => (
        <MemberRow
          key={entry.userId}
          entry={entry}
          showsRoleBadge={web3Enabled}
          showsRoleAction={showsMenu && !entry.isSelf}
          onRoleMenu={() => handleRoleMenu(entry)}
        />
      ))}
      {showsMenu ? (
        <VaultLeaveHostSheet
          ref={hostSheetRef}
          request={hostSheetRequest}
          isWorking={confirmVaultLeave.isPending}
          onConfirm={async (request) => {
            try {
              const result = await confirmVaultLeave.mutateAsync(request.userId);
              return result.completed;
            } catch (err) {
              Alert.alert(mutationErrorMessage(err, t('Failed to confirm leave')));
              return false;
            }
          }}
          onDismiss={() => setHostSheetUserId(null)}
        />
      ) : null}
    </View>
  );
}

function MemberRow({
  entry,
  showsRoleBadge,
  showsRoleAction,
  onRoleMenu,
}: {
  entry: MemberEntry;
  /** Web3 only. The server now stamps `role=HOST` on every new trip's creator, flag or not, so
   *  without this gate a flag-off build would show a "Host" pill develop never had. */
  showsRoleBadge: boolean;
  showsRoleAction: boolean;
  onRoleMenu: () => void;
}) {
  const { t } = useTranslation();
  useAppLanguage();

  const handleFriendAction = () => {
    if (!entry.friendCode) return;
    router.push({ pathname: '/friend/[code]', params: { code: entry.friendCode } });
  };

  const handleRowPress = () => {
    if (entry.isSelf) return;
    router.push({
      pathname: '/friend-profile/[userId]',
      params: { userId: String(entry.userId) },
    });
  };

  // Ordinary members get no badge: a row saying "Member" beside every name is noise — the point
  // of the badge is to pick out the two who are not (`TripDetailView.roleBadge`).
  const roleBadge = !showsRoleBadge
    ? null
    : entry.role === 'HOST'
      ? t('Host')
      : entry.role === 'CO_HOST'
        ? t('Co-host')
        : null;
  const displayName = entry.isSelf ? `${entry.displayName} (${t('You')})` : entry.displayName;

  return (
    <Pressable
      onPress={handleRowPress}
      disabled={entry.isSelf}
      style={styles.row}
      testID={`member-row-${entry.userId}`}
    >
      {entry.isPro ? (
        <ProAvatar uri={entry.avatarUrl} size={AVATAR_SIZE} />
      ) : (
        <Avatar uri={entry.avatarUrl} size={AVATAR_SIZE} />
      )}
      <View style={styles.main}>
        {showsRoleBadge ? (
          <View style={styles.nameRow} testID={`member-name-row-${entry.userId}`}>
            <Text style={[styles.name, styles.nameShrink]} numberOfLines={1}>
              {displayName}
            </Text>
            {roleBadge ? (
              <View style={styles.roleBadge}>
                <Text style={styles.roleBadgeText}>{roleBadge}</Text>
              </View>
            ) : null}
          </View>
        ) : (
          // Flag off: the exact develop markup — a bare name, no wrapper.
          <Text style={styles.name} numberOfLines={1}>
            {displayName}
          </Text>
        )}
        <Text style={styles.subtitle} numberOfLines={1}>
          {mutualLabel(entry.mutualFriendCount, t)}
        </Text>
      </View>
      {showsRoleAction ? (
        <Pressable
          onPress={onRoleMenu}
          accessibilityRole="button"
          accessibilityLabel={t('Change role')}
          hitSlop={8}
          style={styles.roleMenuButton}
          testID={`member-role-menu-${entry.userId}`}
        >
          <SFSymbol
            name="ellipsis.circle"
            fallback="ellipsis-horizontal-circle"
            size={20}
            color={colors.contentM}
          />
        </Pressable>
      ) : null}
      {entry.friendAction ? (
        // Not `disabled` on the Pressable: a disabled RN Pressable declines the responder,
        // so the tap would fall through to the row's own `onPress` (`handleRowPress`)
        // instead of being swallowed. A no-op `onPress` keeps it a true dead zone, matching
        // iOS's disabled `Button`.
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: entry.friendAction === 'friend' }}
          onPress={entry.friendAction === 'friend' ? noop : handleFriendAction}
          testID={`member-action-${entry.userId}`}
          style={[
            styles.actionPill,
            entry.friendAction === 'friend' ? styles.actionPillDisabled : styles.actionPillDark,
          ]}
        >
          <Text
            style={[
              styles.actionLabel,
              entry.friendAction === 'friend' ? styles.actionLabelDisabled : styles.actionLabelDark,
            ]}
          >
            {entry.friendAction === 'friend' ? t('Friend') : t('Add')}
          </Text>
        </Pressable>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 10,
  },
  main: { flex: 1, gap: 2 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...beVietnamPro(14, 'medium'), color: colors.contentB },
  nameShrink: { flexShrink: 1 },
  roleBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: colors.blueBase,
  },
  roleBadgeText: { ...beVietnamPro(12, 'medium'), color: colors.white },
  subtitle: { ...beVietnamPro(12), color: colors.contentM },
  roleMenuButton: { padding: 4 },
  actionPill: { borderRadius: 999, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  actionPillDark: { backgroundColor: colors.black },
  actionPillDisabled: { backgroundColor: colors.neutral200 },
  actionLabel: { ...beVietnamPro(14) },
  actionLabelDark: { color: colors.white },
  actionLabelDisabled: { color: colors.contentM },
});
