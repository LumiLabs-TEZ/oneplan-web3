/**
 * Breakdown tab of the trip-end screen — port of `View/Trip/TripEnd/TripEndBreakdown.swift`.
 * A leaving member sees only their own card (their settlement travels in the route param,
 * because the trip detail 403s once they are removed); everyone else sees the pairwise rows.
 */
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, View } from 'react-native';

import { mutationErrorMessage } from '@/api/mutationError';
import { useSettleCounterparty } from '@/features/settlement/api/mutations';
import { useSettlements } from '@/features/settlement/api/queries';
import {
  rowKey,
  type TripEndMode,
  unsettledCountFor,
} from '@/features/settlement/helpers/settlementModel';
import type { TripBreakdownDto, TripMemberDto } from '@/features/trip/types';
import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { EmptyState, Spinner } from '@/ui/components';
import { spacing } from '@/ui/theme';

import type { LeaveSettlementDto } from '../types';
import { TripEndBreakdownItem } from './TripEndBreakdownItem';
import { TripEndHeroHeader } from './TripEndHeroHeader';
import { TripEndLeaveSettlementItem } from './TripEndLeaveSettlementItem';

export interface TripEndBreakdownTabProps {
  tripId: number;
  mode: TripEndMode;
  currency: Currency;
  coverImageUrl?: string | null;
  breakdown: TripBreakdownDto | undefined;
  /** Used when the breakdown has not loaded (or 403s for a leaving member). */
  fallbackTotalSpent: number;
  fallbackUnsettled: number;
  members: readonly TripMemberDto[];
  currentUserId: number | undefined;
  currentUserAvatarUrl?: string | null;
  leaveSettlement: LeaveSettlementDto | null;
  /** Leaving member confirmed their card — the screen navigates home. */
  onLeaveDone: () => void;
}

export function TripEndBreakdownTab({
  tripId,
  mode,
  currency,
  coverImageUrl,
  breakdown,
  fallbackTotalSpent,
  fallbackUnsettled,
  members,
  currentUserId,
  currentUserAvatarUrl,
  leaveSettlement,
  onLeaveDone,
}: TripEndBreakdownTabProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const isLeaving = mode === 'leaving';
  const settlements = useSettlements(tripId, { enabled: !isLeaving });
  const settle = useSettleCounterparty(tripId);

  const otherMembers = members
    .filter((m) => m.userId !== currentUserId)
    .map((m) => ({ id: m.userId, avatarUrl: m.avatarUrl }));

  const handleSettle = (
    counterpartyUserId: number,
    direction: 'receive' | 'pay',
    isGroup: boolean,
  ) => {
    settle.mutate(
      { counterpartyUserId, direction, isGroup },
      {
        onSuccess: () => {
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
            () => undefined,
          );
        },
        onError: (err) => Alert.alert(mutationErrorMessage(err, t('Please try again'))),
      },
    );
  };

  /** One mutation serves every row, so scope the spinner to the row actually being settled. */
  const isSettlingRow = (counterpartyUserId: number, direction: 'receive' | 'pay') =>
    settle.isPending &&
    settle.variables?.counterpartyUserId === counterpartyUserId &&
    settle.variables?.direction === direction;

  return (
    <View style={styles.root}>
      <TripEndHeroHeader
        coverImageUrl={coverImageUrl}
        totalSpent={breakdown?.totalSpent ?? fallbackTotalSpent}
        unsettledCount={unsettledCountFor(mode, breakdown, fallbackUnsettled)}
        currency={currency}
      />

      {leaveSettlement ? (
        <View style={styles.rows}>
          <TripEndLeaveSettlementItem
            settlement={leaveSettlement}
            avatarUrl={currentUserAvatarUrl}
            currency={currency}
            onMarkAsDone={onLeaveDone}
          />
        </View>
      ) : settlements.isLoading ? (
        // `isLoading` (not `isPending`): a disabled query — `leaving` mode with a settlement
        // param that failed to parse — is pending forever and would hang on a spinner.
        <Spinner />
      ) : settlements.isError || isLeaving ? (
        <View style={styles.rows} testID="settlements-error">
          <EmptyState
            title={t('Failed to load settlements')}
            body={t('Please try again')}
            action={
              settlements.isError
                ? { label: t('Retry'), onPress: () => void settlements.refetch() }
                : undefined
            }
          />
        </View>
      ) : (
        <View style={styles.rows}>
          {(settlements.data?.settlements ?? []).map((row) => (
            <TripEndBreakdownItem
              key={rowKey(row)}
              settlement={row}
              currency={currency}
              members={otherMembers}
              settling={isSettlingRow(row.counterpartyUserId, row.direction)}
              onSettle={() => handleSettle(row.counterpartyUserId, row.direction, row.isGroup)}
            />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xl },
  rows: { gap: spacing.md, paddingHorizontal: spacing.lg },
});
