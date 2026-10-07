/**
 * Port of `ContributeToVaultView.swift` (`origin/feat/web3-version`, Figma `4251:15126`). Moves
 * USDC from the member's personal OnePlan Wallet into the trip vault — the "amount" screen of the
 * deposit chain that `TripVaultSection` swaps for the depositing/result state in place.
 */
import { router } from 'expo-router';
import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import DepositOptionWallet from '@/assets/images/vault/depositOptionWallet.svg';
import { initialKeypadState, keypadReducer } from '@/features/expense/keypad/keypadReducer';
import { useAppLanguage } from '@/i18n';
import { CURRENCIES } from '@/lib/currency';
import { AmountKeypad } from '@/ui/components/AmountKeypad';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useMyVaultWallet } from '../api/queries';
import { depositNetMicro, formatMicroUsdc, microUSDC } from '../depositMath';

export interface ContributeToVaultSheetProps {
  tripId: number;
  /** Micro-USDC to show when opened from a leave-settle handoff. */
  prefilledAmountMicro?: bigint;
  /** When true (leave owed deposit), amount cannot be edited — avoids overpay. */
  locksAmount?: boolean;
  onContribute: (amountMicro: bigint) => void;
  /** '+' next to the balance pill — funds the personal wallet first. */
  onFundWallet?: () => void;
}

function prefilledDigits(amountMicro: bigint): string {
  const usdc = Number(amountMicro) / 1_000_000;
  return usdc === Math.round(usdc) ? String(Math.round(usdc)) : usdc.toFixed(2);
}

export function ContributeToVaultSheet({
  tripId,
  prefilledAmountMicro,
  locksAmount = false,
  onContribute,
  onFundWallet,
}: ContributeToVaultSheetProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const initialDigits =
    prefilledAmountMicro && prefilledAmountMicro > 0n ? prefilledDigits(prefilledAmountMicro) : '';
  // Same keypad (and input rules) as add-expense / add-budget; USD caps the fraction at 2 digits.
  const [keypad, dispatch] = useReducer(keypadReducer, initialDigits, (raw) =>
    initialKeypadState(CURRENCIES.USD, raw),
  );
  const wallet = useMyVaultWallet(tripId);

  const amountMicro =
    locksAmount && prefilledAmountMicro && prefilledAmountMicro > 0n
      ? prefilledAmountMicro
      : microUSDC(keypad.raw);

  const availableMicro = BigInt(wallet.data?.balanceMicro ?? '0');
  const isValid = amountMicro > 0n && amountMicro <= availableMicro;
  const overCapacity = amountMicro > availableMicro;

  const displayAmount =
    locksAmount && prefilledAmountMicro && prefilledAmountMicro > 0n
      ? `$${prefilledDigits(prefilledAmountMicro)}`
      : keypad.raw === ''
        ? '$0'
        : `$${keypad.raw}`;

  const feeDisclosure =
    amountMicro > 0n
      ? t('0.1% fee to OnePlan · group receives {{0}} USDC', {
          0: formatMicroUsdc(depositNetMicro(amountMicro)),
        })
      : t('A 0.1% fee goes to OnePlan.');

  const fundWallet = onFundWallet ?? (() => router.push('/wallet/deposit'));

  return (
    <View style={styles.root} testID="contribute-to-vault-sheet">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          {t('Contribute via ')}
          <Text style={styles.headerTitleAccent}>{t('OnePlan Wallet')}</Text>
        </Text>
        <Text style={styles.headerSubtitle}>
          {t('Contributing to trip fund by using OnePlan Wallet')}
        </Text>
      </View>

      <View style={styles.amountBlock}>
        <Text
          style={[
            styles.amountValue,
            !locksAmount && keypad.raw === '' && styles.amountValueEmpty,
            overCapacity && styles.amountValueError,
          ]}
          numberOfLines={1}
        >
          {displayAmount}
        </Text>
      </View>

      <View style={styles.footer}>
        <View style={styles.balancePill}>
          <DepositOptionWallet width={24} height={24} />
          <Text style={styles.balanceLabel} numberOfLines={1}>
            {t('Your balance')}
          </Text>
          {wallet.isLoading ? (
            <ActivityIndicator size="small" />
          ) : (
            <Text style={styles.balanceValue}>{`$${formatMicroUsdc(availableMicro)}`}</Text>
          )}
          <Pressable
            onPress={fundWallet}
            style={styles.fundButton}
            accessibilityRole="button"
            accessibilityLabel={t('Add funds to your wallet')}
            testID="contribute-fund-wallet"
          >
            <Text style={styles.fundButtonIcon}>+</Text>
          </Pressable>
        </View>

        {locksAmount ? (
          <Text style={styles.lockedNote}>{t('Amount is fixed to clear your leave balance.')}</Text>
        ) : (
          <AmountKeypad state={keypad} dispatch={dispatch} />
        )}

        {overCapacity ? (
          <Text style={styles.errorNote}>{t('Insufficient balance')}</Text>
        ) : (
          <Text style={styles.feeNote}>{feeDisclosure}</Text>
        )}

        <Pressable
          testID="contribute-submit"
          onPress={() => onContribute(amountMicro)}
          disabled={!isValid}
          style={[styles.submitButton, !isValid && styles.submitButtonDisabled]}
          accessibilityRole="button"
        >
          <Text style={styles.submitText}>{t('Contribute to Trip Fund')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 16 },
  header: { alignItems: 'center', gap: 3, marginTop: 12 },
  headerTitle: {
    ...beVietnamPro(20),
    letterSpacing: -0.8,
    color: colors.neutral950,
    textAlign: 'center',
  },
  headerTitleAccent: { ...beVietnamPro(20), color: colors.blueBase, fontStyle: 'italic' },
  headerSubtitle: {
    ...beVietnamPro(14),
    letterSpacing: -0.42,
    color: colors.contentM,
    textAlign: 'center',
  },
  // The sheet sizes to its content, so `flex: 1` alone gives this block no room — pad it.
  amountBlock: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 24 },
  amountValue: { ...beVietnamPro(48), letterSpacing: -2.4, color: colors.neutral950 },
  amountValueEmpty: { opacity: 0.2 },
  amountValueError: { color: '#E02624' },
  footer: { gap: 16, paddingTop: 8, paddingBottom: 32 },
  balancePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#F0F0F0',
  },
  balanceLabel: {
    ...beVietnamPro(16),
    letterSpacing: -0.32,
    color: 'rgba(61, 61, 61, 0.6)',
    flex: 1,
  },
  balanceValue: { ...beVietnamPro(18), letterSpacing: -0.36, color: '#3D3D3D' },
  fundButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fundButtonIcon: { color: colors.white, fontSize: 14, fontWeight: '700' },
  lockedNote: { ...beVietnamPro(13), color: colors.neutral600, textAlign: 'center' },
  errorNote: { ...beVietnamPro(13), color: '#E02624', textAlign: 'center' },
  feeNote: { ...beVietnamPro(13), color: colors.neutral600, textAlign: 'center' },
  submitButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  submitButtonDisabled: { backgroundColor: colors.neutral400 },
  submitText: { ...beVietnamPro(17, 'regular'), letterSpacing: -0.68, color: colors.white },
});
