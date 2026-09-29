import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { keys } from '@/api/keys';
import { queryClient } from '@/api/queryClient';
import type { components } from '@/api/schema';
import {
  VaultLeaveHostSheet,
  type VaultLeaveHostSheetRef,
  VaultLeaveSheet,
  type VaultLeaveSheetRef,
} from '@/features/vault/screens';
import { setAppLanguage, useAppLanguage } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

type LeavePreviewDto = components['schemas']['LeavePreviewDto'];
type VaultLeaveRequestDto = components['schemas']['VaultLeaveRequestDto'];

const BASE_PREVIEW = {
  displayName: 'Ken',
  budgets: [],
  totalBudgetRefund: 0,
  totalBudgetCancelled: 0,
  totalExpenseShare: 0,
  netSettlement: 0,
  hasVault: true,
  canLeave: true,
  vaultLeaveCleared: false,
} satisfies Partial<LeavePreviewDto>;

/**
 * Sums a fixture's own `lines` so `netMicro`/`owedMicro` can never drift from the ledger it's
 * shown next to — the server keeps this invariant for real previews (`lines` IS the ledger
 * `netMicro` nets out to), so an internally-inconsistent fixture would be misleading evidence
 * in a screenshot even though it can't happen in the app itself.
 */
function netMicroOf(lines: LeavePreviewDto['lines']): number {
  return lines.reduce((sum, l) => sum + Number(l.amountMicro), 0);
}

/** Fixture leave-preview per member-sheet state, each under its own trip id so switching states
 * doesn't fight the shared `keys.trips.leavePreview` cache. Each state gets its own ledger so the
 * hero/CTA amount always matches what "Total deposited" − "Total expenses" adds up to below it. */
const MEMBER_FIXTURES = {
  owe: (() => {
    const lines: LeavePreviewDto['lines'] = [
      { title: 'Deposit', amountMicro: '2000000', kind: 'DEPOSIT', time: '09:12', subtitle: 'HcBi...tLAL' },
      { title: 'Hotel deposit', amountMicro: '-3200000', kind: 'SPEND', time: '11:00', subtitle: 'All', category: 'STAY' },
      { title: 'Taxi to airport', amountMicro: '-1250000', kind: 'SPEND', time: '17:30', subtitle: 'Ken, An', category: 'TRANSPORT' },
    ];
    const netMicro = netMicroOf(lines);
    return {
      tripId: 90001,
      preview: {
        ...BASE_PREVIEW,
        lines,
        netMicro: String(netMicro),
        owedMicro: String(Math.max(0, -netMicro)),
        canAnnounce: false,
        leaveRequestPending: false,
      } satisfies LeavePreviewDto,
    };
  })(),
  receive: (() => {
    const lines: LeavePreviewDto['lines'] = [
      { title: 'Deposit', amountMicro: '5000000', kind: 'DEPOSIT', time: '09:12', subtitle: 'HcBi...tLAL' },
      { title: 'Lunch at Tuyet', amountMicro: '-1250000', kind: 'SPEND', time: '12:30', subtitle: 'All', category: 'FOOD' },
      { title: 'Coffee run', amountMicro: '-350000', kind: 'SPEND', time: '15:00', subtitle: 'Ken, An', category: 'COFFEE' },
    ];
    const netMicro = netMicroOf(lines);
    return {
      tripId: 90002,
      preview: {
        ...BASE_PREVIEW,
        lines,
        netMicro: String(netMicro),
        owedMicro: '0',
        canAnnounce: true,
        leaveRequestPending: false,
      } satisfies LeavePreviewDto,
    };
  })(),
  allGood: (() => {
    const lines: LeavePreviewDto['lines'] = [
      { title: 'Deposit', amountMicro: '2000000', kind: 'DEPOSIT', time: '09:12', subtitle: 'HcBi...tLAL' },
      { title: 'Lunch at Tuyet', amountMicro: '-1250000', kind: 'SPEND', time: '12:30', subtitle: 'All', category: 'FOOD' },
      { title: 'Coffee run', amountMicro: '-750000', kind: 'SPEND', time: '15:00', subtitle: 'Ken, An', category: 'COFFEE' },
    ];
    const netMicro = netMicroOf(lines);
    return {
      tripId: 90003,
      preview: {
        ...BASE_PREVIEW,
        lines,
        netMicro: String(netMicro),
        owedMicro: '0',
        canAnnounce: true,
        leaveRequestPending: false,
      } satisfies LeavePreviewDto,
    };
  })(),
  pending: (() => {
    const lines: LeavePreviewDto['lines'] = [
      { title: 'Deposit', amountMicro: '3000000', kind: 'DEPOSIT', time: '09:12', subtitle: 'HcBi...tLAL' },
      { title: 'Lunch at Tuyet', amountMicro: '-1250000', kind: 'SPEND', time: '12:30', subtitle: 'All', category: 'FOOD' },
      { title: 'Coffee run', amountMicro: '-750000', kind: 'SPEND', time: '15:00', subtitle: 'Ken, An', category: 'COFFEE' },
    ];
    const netMicro = netMicroOf(lines);
    return {
      tripId: 90004,
      preview: {
        ...BASE_PREVIEW,
        lines,
        netMicro: String(netMicro),
        owedMicro: '0',
        canAnnounce: false,
        leaveRequestPending: true,
      } satisfies LeavePreviewDto,
    };
  })(),
} as const;

// Distinct `userId` per fixture so `VaultLeaveHostSheet`'s own "reset phase when the request
// changes" logic fires when switching fixtures, even right after confirming one to `left`.
const HOST_FIXTURES = {
  waitingDeposit: {
    tripId: 1,
    userId: 901,
    displayName: 'An',
    netMicro: '-2000000',
    announcedNetMicro: '0',
    status: 'WAITING_DEPOSIT',
    walletAddress: null,
    requestedAt: new Date().toISOString(),
  },
  ready: {
    tripId: 1,
    userId: 902,
    displayName: 'An',
    netMicro: '0',
    announcedNetMicro: '1500000',
    status: 'READY',
    walletAddress: null,
    requestedAt: new Date().toISOString(),
  },
  payout: {
    tripId: 1,
    userId: 903,
    displayName: 'An',
    netMicro: '3000000',
    announcedNetMicro: '3000000',
    status: 'PAYOUT',
    walletAddress: 'HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL',
    requestedAt: new Date().toISOString(),
  },
} satisfies Record<string, VaultLeaveRequestDto>;

function isMemberState(v: string): v is keyof typeof MEMBER_FIXTURES {
  return v in MEMBER_FIXTURES;
}

function isHostState(v: string): v is keyof typeof HOST_FIXTURES {
  return v in HOST_FIXTURES;
}

/**
 * Fixture gallery for the Wave E leave sheets (`VaultLeaveSheet`, `VaultLeaveHostSheet`) —
 * no backend needed. `VaultLeaveSheet` self-fetches `getLeavePreview` via TanStack Query, so
 * each state seeds the shared query cache under its own fixture trip id rather than mocking the
 * hook. Dev-only, same `!isProd` guard as `(dev)/vault-kit`.
 *
 * Open with `oneplan://vault-leave` for the button gallery, or deep-link straight to one state
 * with `?state=<key>` (member: owe/receive/allGood/pending, host: waitingDeposit/ready/payout) —
 * e.g. `oneplan://vault-leave?state=owe&lang=vi` — so a screenshot pass never needs simulated
 * taps. `?lang=en|vi` switches the app language via the same store the Settings screen uses
 * (persists past this screen — a screenshot pass should restore it when done).
 *
 * `adb shell am start -d "...&..."` gotcha: `adb shell` re-parses its argument through the
 * device's own shell, which treats an unescaped `&` as "run in background" and silently drops
 * everything after it (so only `state` arrives, never `lang`) — escape it as `\&` or `%26`.
 */
export default function DevVaultLeaveScreen() {
  const memberSheetRef = useRef<VaultLeaveSheetRef>(null);
  const hostSheetRef = useRef<VaultLeaveHostSheetRef>(null);
  const [memberTripId, setMemberTripId] = useState<number>(MEMBER_FIXTURES.owe.tripId);
  const [hostRequest, setHostRequest] = useState<VaultLeaveRequestDto | null>(null);
  const { state, lang } = useLocalSearchParams<{ state?: string; lang?: string }>();
  const language = useAppLanguage();

  const presentMember = (key: keyof typeof MEMBER_FIXTURES) => {
    const fixture = MEMBER_FIXTURES[key];
    queryClient.setQueryData(keys.trips.leavePreview(fixture.tripId), fixture.preview);
    setMemberTripId(fixture.tripId);
    memberSheetRef.current?.present();
  };

  const presentHost = (key: keyof typeof HOST_FIXTURES) => {
    setHostRequest(HOST_FIXTURES[key]);
    hostSheetRef.current?.present();
  };

  useEffect(() => {
    // Dev-only deep-link entry point: presenting an imperative bottom sheet ref based on a URL
    // param is synchronizing with an external system (the sheet), not app state — the one
    // legitimate case for setState-in-effect.
    if (lang === 'en' || lang === 'vi') setAppLanguage(lang);
    if (!state) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isMemberState(state)) presentMember(state);
    else if (isHostState(state)) presentHost(state);
  }, [state, lang]);

  return (
    <SafeAreaView style={styles.screen} testID="dev-vault-leave-screen">
      <View style={styles.content}>
        <Text style={styles.title}>Vault leave sheets</Text>

        <View style={styles.langRow}>
          <Button
            title="EN"
            variant={language === 'en' ? 'primary' : 'secondary'}
            testID="dev-vault-leave-lang-en"
            onPress={() => setAppLanguage('en')}
          />
          <Button
            title="VI"
            variant={language === 'vi' ? 'primary' : 'secondary'}
            testID="dev-vault-leave-lang-vi"
            onPress={() => setAppLanguage('vi')}
          />
        </View>

        <Text style={styles.sectionTitle}>Member sheet (VaultLeaveSheet)</Text>
        <Button title="Owe" testID="dev-vault-leave-owe" onPress={() => presentMember('owe')} />
        <Button
          title="Receive"
          testID="dev-vault-leave-receive"
          onPress={() => presentMember('receive')}
        />
        <Button
          title="All good"
          testID="dev-vault-leave-allgood"
          onPress={() => presentMember('allGood')}
        />
        <Button
          title="Pending"
          testID="dev-vault-leave-pending"
          onPress={() => presentMember('pending')}
        />

        <Text style={styles.sectionTitle}>Host sheet (VaultLeaveHostSheet)</Text>
        <Button
          title="Waiting deposit"
          testID="dev-vault-leave-host-waiting"
          onPress={() => presentHost('waitingDeposit')}
        />
        <Button title="Ready" testID="dev-vault-leave-host-ready" onPress={() => presentHost('ready')} />
        <Button
          title="Payout"
          testID="dev-vault-leave-host-payout"
          onPress={() => presentHost('payout')}
        />

        <Button title="Back" variant="secondary" onPress={() => router.back()} />
      </View>

      <VaultLeaveSheet ref={memberSheetRef} tripId={memberTripId} onRequestDeposit={() => undefined} />
      <VaultLeaveHostSheet
        ref={hostSheetRef}
        request={hostRequest}
        onConfirm={async () => true}
        onDismiss={() => undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.lg, gap: spacing.sm },
  title: { ...beVietnamPro(24, 'semibold'), color: colors.contentB },
  langRow: { flexDirection: 'row', gap: spacing.sm },
  sectionTitle: { ...beVietnamPro(14, 'semibold'), color: colors.neutral600, marginTop: spacing.md },
});
