/**
 * Port of `VaultHistoryView.swift` (`origin/feat/web3-version`) — deposits and payments for the
 * trip vault, newest first, day-grouped. Separate from the trip's classic expense history because
 * it shows what the wallet did, including deposits, which never become expenses.
 *
 * When `embedsInParentScroll` is true the list is a plain stack for a parent `ScrollView`
 * (trip-end History tab, Wave D). Standalone use keeps its own scroll.
 *
 * A payment or deposit row opens its receipt full-screen (`vault/transaction/[transactionId]`).
 */
import { router } from 'expo-router';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useVaultHistory, type VaultHistoryEntryDto } from '../api/queries';
import { VaultHistoryRow } from '../components/VaultHistoryRow';
import {
  dayTotalLabel,
  groupHistoryByDay,
  hasHistoryDetail,
  mapHistoryEntry,
} from './historyGrouping';

export interface VaultHistoryViewProps {
  tripId: number;
  /** False on trip-end — server rejects spend edits after the trip ends. */
  allowsEditing?: boolean;
  /** Omit the outer `ScrollView` so a parent (trip-end) can nest this under hero/plan. */
  embedsInParentScroll?: boolean;
}

export function VaultHistoryView({
  tripId,
  allowsEditing = true,
  embedsInParentScroll = false,
}: VaultHistoryViewProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const historyQuery = useVaultHistory(tripId);

  const entries = useMemo(() => historyQuery.data ?? [], [historyQuery.data]);
  const now = useMemo(() => new Date(), []);
  const todayLabel = t('Today');
  const days = useMemo(
    () => groupHistoryByDay(entries, now, todayLabel),
    [entries, now, todayLabel],
  );

  function openEntry(entry: VaultHistoryEntryDto) {
    router.push({
      pathname: '/trip/[tripId]/vault/transaction/[transactionId]',
      params: {
        tripId: String(tripId),
        transactionId: String(entry.id),
        ...(allowsEditing ? {} : { readOnly: '1' }),
      },
    });
  }

  // Only the first load gets a spinner — a reload after a payment replaces a list that is
  // already right apart from one new row, and blanking it to a spinner reads as data loss.
  const isFirstLoad = historyQuery.isLoading && entries.length === 0;

  const content = isFirstLoad ? (
    <ActivityIndicator
      style={embedsInParentScroll ? styles.spinnerEmbedded : styles.spinnerStandalone}
    />
  ) : entries.length === 0 ? (
    <View
      style={embedsInParentScroll ? styles.emptyEmbedded : styles.emptyStandalone}
      testID="vault-history-empty"
    >
      <Text style={styles.emptyTitle}>{t('No history')}</Text>
      <Text style={styles.emptySubtitle}>{t('Deposit USDC or pay a merchant to get started')}</Text>
    </View>
  ) : (
    <View style={styles.days}>
      {days.map((day) => (
        <View key={day.key} style={styles.dayGroup}>
          <View style={styles.dayHeader}>
            <Text style={styles.dayTitle}>{day.title}</Text>
            {(() => {
              const total = dayTotalLabel(day.entries);
              return total ? <Text style={styles.dayTotal}>{total}</Text> : null;
            })()}
          </View>
          <View style={styles.dayCard}>
            {day.entries.map((entry, index) => (
              <View key={entry.id}>
                {index > 0 ? <View style={styles.divider} /> : null}
                <VaultHistoryRow
                  entry={mapHistoryEntry(entry, t)}
                  onPress={hasHistoryDetail(entry) ? () => openEntry(entry) : undefined}
                  testID={`vault-history-row-${entry.kind.toLowerCase()}${
                    entry.needsApproval ? '-awaiting' : ''
                  }-${entry.id}`}
                />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <View style={embedsInParentScroll ? undefined : styles.flex} testID="vault-history-view">
      {historyQuery.isError ? (
        <Text style={styles.error}>{t('Could not load history')}</Text>
      ) : null}
      {embedsInParentScroll ? (
        content
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  scrollContent: { padding: 16 },
  spinnerStandalone: { flex: 1 },
  spinnerEmbedded: { paddingVertical: 24 },
  emptyStandalone: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  emptyEmbedded: { alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 24 },
  emptyTitle: { ...beVietnamPro(16), color: colors.contentB },
  emptySubtitle: { ...beVietnamPro(14), color: colors.contentM },
  error: { ...beVietnamPro(14), color: colors.secondary, padding: 16 },
  days: { gap: 8 },
  dayGroup: { gap: 8 },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  dayTitle: { ...beVietnamPro(14), letterSpacing: -0.28, color: colors.contentM },
  dayTotal: { ...beVietnamPro(14), letterSpacing: -0.28, color: colors.contentM },
  dayCard: { paddingHorizontal: 4, borderRadius: 24, backgroundColor: colors.surface },
  divider: { height: 1, backgroundColor: colors.dividerStroke },
});
