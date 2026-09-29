/**
 * Port of `WalletWithdrawView.swift` (`origin/feat/web3-version`, Figma `4251:4124`) — withdraws
 * USDC from the personal OnePlan Wallet to any Solana address. Amount + destination live on one
 * screen so the member sees both before they sign; on send, swaps in place to the result screen
 * rather than navigating.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { mutationErrorMessage } from '@/api/mutationError';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { useWallet } from '../api/queries';
import { useInspectWithdrawRecipient } from '../api/walletWithdraw';
import { AmountKeypad } from '../components/AmountKeypad';
import { microUSDC } from '../depositMath';
import { shortenAddress } from '../shortenAddress';
import { useAmountDigits } from '../components/useAmountDigits';
import { useWithdrawFromWallet } from '../signing/withdrawFlow';
import type { WalletWithdrawResult } from './WalletWithdrawResultScreen';
import { WalletWithdrawResultScreen } from './WalletWithdrawResultScreen';

export interface WalletWithdrawSheetProps {
  onFinished: () => void;
  /** Prefill from settlement Send (creditor wallet + cash-debt amount) — Wave D. */
  prefilledAddress?: string;
  prefilledAmountMicro?: bigint;
}

function trimmedAmount(usdc: number): string {
  return usdc === Math.round(usdc) ? usdc.toFixed(0) : usdc.toFixed(2);
}

export function WalletWithdrawSheet({
  onFinished,
  prefilledAddress = '',
  prefilledAmountMicro,
}: WalletWithdrawSheetProps) {
  useAppLanguage();
  const { t } = useTranslation();

  const [address, setAddress] = useState(prefilledAddress);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [addressDraft, setAddressDraft] = useState(prefilledAddress);
  const digits = useAmountDigits(
    true,
    prefilledAmountMicro && prefilledAmountMicro > 0n
      ? trimmedAmount(Number(prefilledAmountMicro) / 1_000_000)
      : '',
  );
  const [recipientIsNew, setRecipientIsNew] = useState(false);
  const [addressError, setAddressError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [result, setResult] = useState<WalletWithdrawResult | null>(null);

  const walletQuery = useWallet();
  const inspectRecipient = useInspectWithdrawRecipient();
  const withdraw = useWithdrawFromWallet();

  const balanceMicro = walletQuery.data ? BigInt(walletQuery.data.balanceMicro) : 0n;
  const amountMicro = microUSDC(digits.digits);
  const hasAddress = address.trim() !== '';
  const overCapacity = amountMicro > balanceMicro;
  const canSend =
    hasAddress && addressError === null && amountMicro > 0n && !overCapacity && !withdraw.isPending;
  const displayAmount = digits.digits === '' ? '$0' : `$${digits.digits}`;

  useEffect(() => {
    if (hasAddress) void checkAddress(address);
    // Only on mount — subsequent checks are user-triggered (paste / Done).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkAddress(value: string) {
    if (value.trim() === '') {
      setAddressError(null);
      setRecipientIsNew(false);
      return;
    }
    try {
      const check = await inspectRecipient.mutateAsync(value.trim());
      setAddress(check.address);
      setRecipientIsNew(check.isNew);
      setAddressError(null);
    } catch (err) {
      setAddressError(mutationErrorMessage(err, t('Withdrawal failed')));
    }
  }

  async function paste() {
    const text = (await Clipboard.getStringAsync()).trim();
    if (text) {
      setAddress(text);
      await checkAddress(text);
    }
  }

  function confirmAddressEdit() {
    setAddress(addressDraft);
    setIsEditingAddress(false);
    void checkAddress(addressDraft);
  }

  async function send() {
    setErrorMessage(null);
    try {
      const outcome = await withdraw.mutateAsync({ address, amountMicro });
      setResult({
        status: outcome.status === 'CONFIRMED' ? 'completed' : 'processing',
        amountMicro,
        recipient: address,
        signature: outcome.signature,
        date: new Date(),
      });
    } catch (err) {
      setErrorMessage(mutationErrorMessage(err, t('Withdrawal failed')));
    }
  }

  if (result) {
    return (
      <WalletWithdrawResultScreen
        result={result}
        onDone={onFinished}
        onSendAgain={() => setResult(null)}
      />
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.handle} />

      <View style={styles.header}>
        <Text style={styles.headerLine}>
          <Text style={styles.headerLineNormal}>{t('Withdraw from ')}</Text>
          <Text style={styles.headerLineAccent}>{t('OnePlan Wallet')}</Text>
        </Text>
        <Text style={styles.headerSubtitle}>{t('Withdrawing to your personal Solana wallet')}</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.amountBlock}>
          <Text style={styles.amountCaption}>{t('Withdraw amount')}</Text>
          <Text
            style={[
              styles.amount,
              overCapacity ? styles.amountOver : digits.digits === '' ? styles.amountEmpty : null,
            ]}
            numberOfLines={1}
          >
            {displayAmount}
          </Text>
        </View>

        {isEditingAddress ? (
          <View style={styles.addressEditor}>
            <TextInput
              value={addressDraft}
              onChangeText={setAddressDraft}
              placeholder={t('Wallet address')}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.addressInput}
              testID="withdraw-address-input"
            />
            <Pressable
              onPress={confirmAddressEdit}
              style={styles.addressDoneButton}
              testID="withdraw-address-done"
            >
              <Text style={styles.addressDoneLabel}>{t('Done')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            onPress={() => {
              setAddressDraft(address);
              setIsEditingAddress(true);
            }}
            style={styles.addressPill}
            testID="withdraw-address-pill"
          >
            <Ionicons name="arrow-up" size={12} color={colors.blueBase} />
            <Text
              style={[styles.addressText, !hasAddress && styles.addressPlaceholder]}
              numberOfLines={1}
            >
              {hasAddress ? shortenAddress(address) : t('Wallet address')}
            </Text>
            <Pressable onPress={paste} style={styles.pasteButton} testID="withdraw-paste">
              {inspectRecipient.isPending ? (
                <ActivityIndicator size="small" color={colors.white} />
              ) : (
                <Text style={styles.pasteLabel}>{t('Paste')}</Text>
              )}
            </Pressable>
          </Pressable>
        )}

        {addressError ? (
          <Text style={styles.addressErrorText}>{addressError}</Text>
        ) : recipientIsNew && hasAddress ? (
          <Text style={styles.addressWarningText}>
            {t('This address has never held USDC. Check it carefully.')}
          </Text>
        ) : null}

        <AmountKeypad allowsDecimal onAppend={digits.append} onDelete={digits.delete} />

        {overCapacity ? (
          <Text style={styles.overCapacityText}>{t('Insufficient balance')}</Text>
        ) : null}
        {errorMessage ? <Text style={styles.overCapacityText}>{errorMessage}</Text> : null}

        <Pressable
          onPress={() => void send()}
          disabled={!canSend}
          style={[styles.confirmButton, !canSend && styles.confirmButtonDisabled]}
          testID="withdraw-confirm"
        >
          {withdraw.isPending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.confirmLabel}>{t('Confirm & Withdraw')}</Text>
          )}
        </Pressable>

        <Text style={styles.feeNote}>{t('Network fees are covered by One Plan.')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.white, paddingHorizontal: 16 },
  handle: {
    alignSelf: 'center',
    width: 35,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(60,60,67,0.3)',
    marginTop: 12,
  },
  header: { alignItems: 'center', gap: 3, paddingTop: 16 },
  headerLine: { ...beVietnamPro(20), letterSpacing: -0.8, textAlign: 'center' },
  headerLineNormal: { color: colors.neutral950 },
  headerLineAccent: { color: colors.blueBase, fontStyle: 'italic' },
  headerSubtitle: {
    ...beVietnamPro(14),
    letterSpacing: -0.42,
    color: colors.contentM,
    textAlign: 'center',
  },
  scrollContent: { paddingBottom: 32, gap: 12 },
  amountBlock: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  amountCaption: { ...beVietnamPro(14), letterSpacing: -0.7, color: colors.neutral950 },
  amount: { ...beVietnamPro(48), letterSpacing: -2.4, color: colors.neutral950 },
  amountEmpty: { color: 'rgba(54, 54, 54, 0.2)' },
  amountOver: { color: colors.secondary },
  addressPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 12,
    borderRadius: 999,
    backgroundColor: colors.neutral50,
    borderWidth: 1,
    borderColor: colors.neutral100,
  },
  addressText: { flex: 1, ...beVietnamPro(16), letterSpacing: -0.32, color: 'rgb(61,61,61)' },
  addressPlaceholder: { opacity: 0.4 },
  pasteButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.black,
  },
  pasteLabel: { ...beVietnamPro(14), letterSpacing: -0.28, color: colors.white },
  addressEditor: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addressInput: {
    flex: 1,
    ...beVietnamPro(15),
    padding: 12,
    borderRadius: 12,
    backgroundColor: colors.neutral50,
  },
  addressDoneButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: colors.black,
  },
  addressDoneLabel: { ...beVietnamPro(15), color: colors.white },
  addressErrorText: { ...beVietnamPro(13), color: colors.secondary, textAlign: 'center' },
  addressWarningText: { ...beVietnamPro(13), color: colors.warning500, textAlign: 'center' },
  overCapacityText: { ...beVietnamPro(13), color: colors.secondary, textAlign: 'center' },
  confirmButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  confirmButtonDisabled: { backgroundColor: colors.neutral400 },
  confirmLabel: { ...beVietnamPro(17), letterSpacing: -0.68, color: colors.white },
  feeNote: { ...beVietnamPro(13), color: colors.contentM, textAlign: 'center' },
});
