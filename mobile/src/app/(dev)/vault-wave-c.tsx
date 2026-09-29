/**
 * Fixture gallery for every Wave C screen — no backend required. Each entry seeds a fresh
 * `QueryClient` with fixture data (for screens that call `useVaultHistory`/`useWallet`/etc.
 * directly) or passes fixture props (for screens that take data as props). Dev-only, same
 * `!isProd` guard as `(dev)/vault-kit`. Open with `dev.lumilabs.oneplan:///vault-wave-c`.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { keys } from '@/api/keys';
import type { VaultHistoryEntryDto, VaultTransactionDetailDto } from '@/features/vault/api/queries';
import { OnePlanWalletScreen } from '@/features/vault/screens/OnePlanWalletScreen';
import { VaultHistoryView } from '@/features/vault/screens/VaultHistoryView';
import { VaultTransactionDetailScreen } from '@/features/vault/screens/VaultTransactionDetailScreen';
import { VaultTransactionEditScreen } from '@/features/vault/screens/VaultTransactionEditScreen';
import { WalletWithdrawResultScreen } from '@/features/vault/screens/WalletWithdrawResultScreen';
import { WalletWithdrawSheet } from '@/features/vault/screens/WalletWithdrawSheet';
import { setAppLanguage, useAppLanguage } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const NOW_ISO = new Date().toISOString();
const EARLIER_TODAY_ISO = new Date(Date.now() - 3 * 3600_000).toISOString();
const YESTERDAY_ISO = new Date(Date.now() - 26 * 3600_000).toISOString();

const HISTORY_FIXTURE: VaultHistoryEntryDto[] = [
  {
    id: 1,
    kind: 'SPEND',
    status: 'CONFIRMED',
    needsApproval: false,
    amountMicro: '7660000',
    amountVnd: '200000',
    title: 'Coffee',
    category: 'COFFEE',
    paidBy: { userId: 1, displayName: 'Cattie', avatarUrl: null },
    shareWith: [
      { userId: 2, displayName: 'Nam', avatarUrl: null },
      { userId: 3, displayName: 'An', avatarUrl: null },
    ],
    createdAt: NOW_ISO,
  },
  {
    id: 2,
    kind: 'SPEND',
    status: 'CONFIRMED',
    needsApproval: true,
    amountMicro: '190000000',
    amountVnd: '5000000',
    title: 'Homestay',
    category: 'STAY',
    shareWith: [],
    createdAt: EARLIER_TODAY_ISO,
  },
  {
    id: 3,
    kind: 'DEPOSIT',
    status: 'CONFIRMED',
    needsApproval: false,
    amountMicro: '100000000',
    fromAddress: 'HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL',
    shareWith: [],
    createdAt: YESTERDAY_ISO,
  },
  {
    id: 4,
    kind: 'SETTLEMENT',
    status: 'CONFIRMED',
    needsApproval: false,
    amountMicro: '20000000',
    recipient: { userId: 2, displayName: 'Nam', avatarUrl: null },
    shareWith: [],
    createdAt: YESTERDAY_ISO,
  },
];

const TRANSACTION_DETAIL_FIXTURE: VaultTransactionDetailDto = {
  id: 1,
  status: 'CONFIRMED',
  needsApproval: false,
  canApprove: false,
  canCancel: false,
  canEdit: true,
  amountVnd: '200000',
  amountUsdcMicro: '7660000',
  recipientName: 'Nguyen Van A',
  bankName: 'Techcombank',
  bankAccountNumber: '0271003061328',
  feeMicro: '57450',
  rate: '26500',
  name: 'Coffee',
  note: 'Chuyen tien',
  category: 'COFFEE',
  madeBy: { userId: 1, displayName: 'Cattie', avatarUrl: null },
  shareWith: [
    { userId: 2, displayName: 'Nam', avatarUrl: null },
    { userId: 3, displayName: 'An', avatarUrl: null },
  ],
  qrPayload: 'FAKE_QR_PAYLOAD',
  createdAt: NOW_ISO,
};

const WALLET_HISTORY_FIXTURE = [
  {
    id: 'sig1',
    kind: 'deposit',
    address: 'HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL',
    amountMicro: '100000000',
    blockTime: '0',
    createdAt: NOW_ISO,
  },
  {
    id: 'sig2',
    kind: 'withdraw',
    address: 'D3ade7xyzabcdefghijklmnop',
    amountMicro: '20000000',
    blockTime: '0',
    createdAt: EARLIER_TODAY_ISO,
  },
];

function seededClient(): QueryClient {
  const client = new QueryClient({
    // `staleTime: Infinity` so seeded fixture data never triggers a real background refetch
    // (there is no backend here — a refetch would fail and flash "Could not load history").
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  client.setQueryData(keys.vault.history(1), HISTORY_FIXTURE);
  client.setQueryData(keys.vault.transaction(1, 1), TRANSACTION_DETAIL_FIXTURE);
  client.setQueryData(keys.wallet.balance, {
    publicKey: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
    usdcAta: 'HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL',
    balanceMicro: '120000000',
  });
  client.setQueryData(keys.wallet.history, WALLET_HISTORY_FIXTURE);
  return client;
}

type Demo =
  | 'menu'
  | 'history'
  | 'detail-completed'
  | 'detail-approve'
  | 'detail-waiting'
  | 'edit'
  | 'wallet-screen'
  | 'withdraw-sheet'
  | 'withdraw-result-completed'
  | 'withdraw-result-processing'
  | 'withdraw-result-failed';

export default function DevVaultWaveCScreen() {
  const language = useAppLanguage();
  const { t } = useTranslation();
  const [demo, setDemo] = useState<Demo>('menu');
  const client = useMemo(() => seededClient(), []);

  if (demo !== 'menu') {
    return (
      <QueryClientProvider client={client}>
        <DemoScreen demo={demo} onBack={() => setDemo('menu')} />
      </QueryClientProvider>
    );
  }

  return (
    <SafeAreaView style={styles.screen} testID="dev-vault-wave-c-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Vault — Wave C</Text>
        <View style={styles.langRow}>
          <Button
            title="EN"
            variant={language === 'en' ? 'primary' : 'secondary'}
            onPress={() => setAppLanguage('en')}
            testID="dev-wave-c-lang-en"
          />
          <Button
            title="VI"
            variant={language === 'vi' ? 'primary' : 'secondary'}
            onPress={() => setAppLanguage('vi')}
            testID="dev-wave-c-lang-vi"
          />
          <Button title={t('Back')} variant="secondary" onPress={() => router.back()} />
        </View>

        <MenuButton
          label="Vault history (day-grouped, tap a row)"
          testID="dev-wave-c-history"
          onPress={() => setDemo('history')}
        />
        <MenuButton
          label="Transaction detail — completed"
          testID="dev-wave-c-detail-completed"
          onPress={() => setDemo('detail-completed')}
        />
        <MenuButton
          label="Transaction detail — canApprove"
          testID="dev-wave-c-detail-approve"
          onPress={() => setDemo('detail-approve')}
        />
        <MenuButton
          label="Transaction detail — needsApproval (waiting)"
          testID="dev-wave-c-detail-waiting"
          onPress={() => setDemo('detail-waiting')}
        />
        <MenuButton
          label="Edit payment metadata"
          testID="dev-wave-c-edit"
          onPress={() => setDemo('edit')}
        />
        <MenuButton
          label="Personal wallet screen"
          testID="dev-wave-c-wallet-screen"
          onPress={() => setDemo('wallet-screen')}
        />
        <MenuButton
          label="Withdraw sheet"
          testID="dev-wave-c-withdraw-sheet"
          onPress={() => setDemo('withdraw-sheet')}
        />
        <MenuButton
          label="Withdraw result — completed"
          testID="dev-wave-c-withdraw-completed"
          onPress={() => setDemo('withdraw-result-completed')}
        />
        <MenuButton
          label="Withdraw result — processing"
          testID="dev-wave-c-withdraw-processing"
          onPress={() => setDemo('withdraw-result-processing')}
        />
        <MenuButton
          label="Withdraw result — failed"
          testID="dev-wave-c-withdraw-failed"
          onPress={() => setDemo('withdraw-result-failed')}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

function DemoScreen({ demo, onBack }: { demo: Exclude<Demo, 'menu'>; onBack: () => void }) {
  const { t } = useTranslation();
  switch (demo) {
    case 'history':
      return (
        <SafeAreaView style={styles.fill}>
          <View style={styles.backRow}>
            <Button title={t('Back')} variant="secondary" onPress={onBack} />
          </View>
          <VaultHistoryView tripId={1} allowsEditing onSendAgain={() => undefined} />
        </SafeAreaView>
      );
    case 'detail-completed':
      return (
        <VaultTransactionDetailScreen
          detail={mapFixtureDetail()}
          tripId={1}
          vaultTransactionId={1}
          allowsEditing
          onBack={onBack}
          onSendAgain={() => undefined}
        />
      );
    case 'detail-approve':
      return (
        <VaultTransactionDetailScreen
          detail={{
            ...mapFixtureDetail(),
            needsApproval: true,
            canApprove: true,
            status: 'pending',
          }}
          tripId={1}
          vaultTransactionId={1}
          onBack={onBack}
        />
      );
    case 'detail-waiting':
      return (
        <VaultTransactionDetailScreen
          detail={{
            ...mapFixtureDetail(),
            needsApproval: true,
            canApprove: false,
            status: 'pending',
          }}
          tripId={1}
          vaultTransactionId={1}
          onBack={onBack}
        />
      );
    case 'edit':
      return (
        <VaultTransactionEditScreen
          tripId={1}
          vaultTransactionId={1}
          amountVnd={200_000}
          rate={26_500}
          members={[]}
          initialName="Coffee"
          initialCategory="COFFEE"
          initialShareWithUserIds={[]}
          onBack={onBack}
          onSaved={onBack}
        />
      );
    case 'wallet-screen':
      return (
        <OnePlanWalletScreen
          onBack={onBack}
          onWithdraw={() => undefined}
          onDeposit={() => undefined}
        />
      );
    case 'withdraw-sheet':
      return (
        <SafeAreaView style={styles.fill}>
          <View style={styles.backRow}>
            <Button title={t('Back')} variant="secondary" onPress={onBack} />
          </View>
          <WalletWithdrawSheet onFinished={onBack} />
        </SafeAreaView>
      );
    case 'withdraw-result-completed':
      return (
        <WalletWithdrawResultScreen
          result={{
            status: 'completed',
            amountMicro: 20_000_000n,
            recipient: 'D3ade7xyzabcdefghijklmnop',
            signature: 'h42fjh24abcd',
            date: new Date(),
          }}
          onDone={onBack}
          onSendAgain={() => undefined}
        />
      );
    case 'withdraw-result-processing':
      return (
        <WalletWithdrawResultScreen
          result={{
            status: 'processing',
            amountMicro: 20_000_000n,
            recipient: 'D3ade7xyzabcdefghijklmnop',
            signature: 'h42fjh24abcd',
            date: new Date(),
          }}
          onDone={onBack}
        />
      );
    case 'withdraw-result-failed':
      return (
        <WalletWithdrawResultScreen
          result={{
            status: 'failed',
            amountMicro: 20_000_000n,
            recipient: 'D3ade7xyzabcdefghijklmnop',
            signature: 'h42fjh24abcd',
            date: new Date(),
          }}
          onDone={onBack}
        />
      );
  }
}

function mapFixtureDetail() {
  return {
    amountVnd: 200_000,
    recipientName: 'Nguyen Van A',
    status: 'completed' as const,
    createdAt: NOW_ISO,
    bankName: 'Techcombank',
    bankAccountNumber: '0271003061328',
    feeVnd: 1522,
    feePercent: 0.75,
    feeUsdc: 0.06,
    rate: 26_500,
    note: 'Chuyen tien',
    name: 'Coffee',
    needsApproval: false,
    canApprove: false,
    canCancel: false,
    canEdit: true,
    category: 'COFFEE' as const,
    paidByName: null,
    shareWithNames: ['Nam', 'An'],
    shareWithUserIds: [2, 3],
    madeByName: 'Cattie',
    madeByAvatarUrl: null,
    qrPayload: 'FAKE_QR_PAYLOAD',
  };
}

function MenuButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  return (
    <View style={styles.menuButtonWrap}>
      <Button title={label} variant="secondary" onPress={onPress} testID={testID} multiline />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, gap: spacing.sm },
  title: { ...beVietnamPro(20), color: colors.contentB },
  langRow: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  menuButtonWrap: { marginBottom: spacing.xs },
  backRow: { padding: spacing.sm },
});
