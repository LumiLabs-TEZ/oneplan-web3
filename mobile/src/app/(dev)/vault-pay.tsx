import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { components } from '@/api/schema';
import {
  VaultExpenseSheet,
  type VaultExpenseDetails,
  type VaultExpenseSheetRef,
} from '@/features/vault/screens/VaultExpenseSheet';
import { VaultPayAmountScreen } from '@/features/vault/screens/VaultPayAmountScreen';
import { VaultScanQRScreen } from '@/features/vault/screens/VaultScanQRScreen';
import { useAppLanguage, setAppLanguage } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

type TripMemberDto = components['schemas']['TripMemberDto'];

const FIXTURE_MEMBERS: TripMemberDto[] = [
  {
    id: 1,
    userId: 1,
    displayName: 'Ken',
    avatarUrl: null,
    inviteStatus: 'ACCEPTED',
    role: 'HOST',
    isPro: false,
  },
  {
    id: 2,
    userId: 2,
    displayName: 'Linh',
    avatarUrl: null,
    inviteStatus: 'ACCEPTED',
    role: 'MEMBER',
    isPro: false,
  },
  {
    id: 3,
    userId: 3,
    displayName: 'Not-yet-joined',
    avatarUrl: null,
    inviteStatus: 'PENDING',
    role: 'MEMBER',
    isPro: false,
  },
];

type Step = 'menu' | 'scan' | 'amount' | 'expense' | 'result';

/**
 * Fixture-mode gallery for the Wave B pay flow — no vault/wallet backend is available yet
 * (Wave A's signing pipeline isn't merged), so this drives the three screens with static props for
 * manual/screenshot verification against the Swift originals (`ios/OnePlan/OnePlan/View/Vault/
 * VaultScanQRView.swift`, `VaultPayAmountView.swift`, `VaultExpenseSheet.swift`, `feat/web3-version`).
 * Dev-only, same `!isProd` guard as `(dev)/vault-kit`. Open with `dev.lumilabs.oneplan:///vault-pay`.
 */
export default function DevVaultPayScreen() {
  const language = useAppLanguage();
  const [step, setStep] = useState<Step>('menu');
  const [scannedPayload, setScannedPayload] = useState<string | null>(null);
  const [amountVnd, setAmountVnd] = useState<string | null>(null);
  const [expenseDetails, setExpenseDetails] = useState<VaultExpenseDetails | null>(null);

  if (step === 'scan') {
    return (
      <VaultScanQRScreen
        onScanned={(_payload, raw) => {
          setScannedPayload(raw);
          setStep('amount');
        }}
        onCancel={() => setStep('menu')}
      />
    );
  }

  if (step === 'amount') {
    return (
      <VaultPayAmountScreen
        recipientName="Nguyen Van A"
        balanceVnd={5_000_000}
        prefilledAmountVnd={null}
        indicativeRate={26_500}
        onBack={() => setStep(scannedPayload ? 'scan' : 'menu')}
        onNext={(vnd) => {
          setAmountVnd(vnd);
          setStep('expense');
        }}
      />
    );
  }

  if (step === 'expense') {
    return (
      <ExpenseFixtureHost
        onDone={(details) => {
          setExpenseDetails(details);
          setStep('result');
        }}
        onDismiss={() => setStep('menu')}
      />
    );
  }

  return (
    <SafeAreaView style={styles.screen} testID="dev-vault-pay-screen">
      <View style={styles.content}>
        <Text style={styles.title}>Vault pay flow (fixtures)</Text>
        <View style={styles.langRow}>
          <Button
            title="EN"
            variant={language === 'en' ? 'primary' : 'secondary'}
            testID="dev-vault-pay-lang-en"
            onPress={() => setAppLanguage('en')}
          />
          <Button
            title="VI"
            variant={language === 'vi' ? 'primary' : 'secondary'}
            testID="dev-vault-pay-lang-vi"
            onPress={() => setAppLanguage('vi')}
          />
          <Button title="Back" variant="secondary" onPress={() => router.back()} />
        </View>

        <Button
          title="1. VaultScanQRScreen"
          testID="dev-vault-pay-open-scan"
          onPress={() => setStep('scan')}
        />
        <Button
          title="2. VaultPayAmountScreen (skip scan)"
          testID="dev-vault-pay-open-amount"
          onPress={() => {
            setScannedPayload(null);
            setStep('amount');
          }}
        />
        <Button
          title="3. VaultExpenseSheet (skip amount)"
          testID="dev-vault-pay-open-expense"
          onPress={() => setStep('expense')}
        />

        {step === 'result' ? (
          <View style={styles.resultCard} testID="dev-vault-pay-result">
            <Text style={styles.resultTitle}>Last submitted PayRequest</Text>
            <Text style={styles.resultLine}>qrPayload: {scannedPayload ?? '(none — started at step 2/3)'}</Text>
            <Text style={styles.resultLine}>amountVnd: {amountVnd ?? '(none)'}</Text>
            <Text style={styles.resultLine}>name: {expenseDetails?.name}</Text>
            <Text style={styles.resultLine}>category: {expenseDetails?.category}</Text>
            <Text style={styles.resultLine}>payer (source): {expenseDetails?.payer}</Text>
            <Text style={styles.resultLine}>
              shareWithUserIds: {JSON.stringify(expenseDetails?.shareWithUserIds)}
            </Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

/** AppSheet/BottomSheetModal only opens on an explicit `.present()` — present it as soon as this
 * step mounts so the fixture gallery doesn't need a second "open sheet" button. */
function ExpenseFixtureHost({
  onDone,
  onDismiss,
}: {
  onDone: (details: VaultExpenseDetails) => void;
  onDismiss: () => void;
}) {
  const ref = useRef<VaultExpenseSheetRef>(null);
  useEffect(() => {
    ref.current?.present();
  }, []);

  return (
    <View style={styles.screen} testID="dev-vault-pay-expense-host">
      <VaultExpenseSheet
        ref={ref}
        members={FIXTURE_MEMBERS}
        personalBalanceUsdc={12.5}
        fallbackName="Nguyen Van A"
        onDone={onDone}
        onDismiss={onDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { ...beVietnamPro(24, 'semibold'), color: colors.contentB },
  langRow: { flexDirection: 'row', gap: spacing.sm },
  resultCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: 12,
    backgroundColor: colors.background,
    gap: 4,
  },
  resultTitle: { ...beVietnamPro(14, 'semibold'), color: colors.contentB },
  resultLine: { ...beVietnamPro(13), color: colors.contentM },
});
