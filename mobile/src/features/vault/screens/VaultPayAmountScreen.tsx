/**
 * Types the VND amount to pay a scanned merchant — port of
 * `ios/OnePlan/OnePlan/View/Vault/VaultPayAmountView.swift` (`feat/web3-version`).
 *
 * Most Vietnamese shop codes are static and carry no amount, so an empty keypad is the normal
 * path rather than an edge case; when the code does carry one the field starts filled (Swift:
 * `prefilledAmountVnd`) and the user only confirms.
 *
 * The recipient name is fetched separately (async, best-effort, via `lookupVaultRecipient` —
 * `../api/pay.ts`) — NOT decoded from the QR code itself. It is the field that actually tells the
 * payer who they are paying, so it starts as `…` rather than blocking the screen (Swift doc
 * comment, same rationale).
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { AmountKeypad, useAmountDigits, VaultHeaderChip } from '@/features/vault/components';
import { useAppLanguage } from '@/i18n';
import { SFSymbol } from '@/ui/components';
import { applyLiveFormatting, formatWhole } from '@/lib/currency';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const vietnamFlag = require('@/assets/images/vault/flagVietnam.png') as number;

export interface VaultPayAmountScreenProps {
  /** `'…'` while `lookupVaultRecipient` is still in flight — never blocks the screen. */
  recipientName: string;
  /** The group's money, shown in the header "Balance" chip. */
  balanceVnd: number;
  /**
   * What the keypad refuses to go above. Defaults to `balanceVnd`, but a member may go on to pay
   * from their own (larger) wallet — the cap is then the larger of the two; the server has the
   * final word.
   */
  capVnd?: number;
  /** Amount already carried by the QR code, if any. */
  prefilledAmountVnd?: bigint | null;
  /** VND per USDC, for the indicative line only. */
  indicativeRate: number;
  onBack: () => void;
  /** Decimal-string VND, matching the `PayRequest.amountVnd` wire shape. */
  onNext: (amountVnd: string) => void;
}

export function VaultPayAmountScreen({
  recipientName,
  balanceVnd,
  capVnd,
  prefilledAmountVnd,
  indicativeRate,
  onBack,
  onNext,
}: VaultPayAmountScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const { digits, append, delete: del, setDigits } = useAmountDigits(false);

  useEffect(() => {
    if (prefilledAmountVnd != null && digits === '') setDigits(prefilledAmountVnd.toString());
    // Only ever applies once, on mount — matches Swift's `.onAppear` guard `digits.isEmpty`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const amountVnd = digits === '' ? 0 : Number(digits);
  const formattedAmount = digits === '' ? '0' : applyLiveFormatting(digits, 0);
  const usdcText = indicativeRate > 0 ? `$${(amountVnd / indicativeRate).toFixed(2)}` : '';
  const cap = capVnd ?? balanceVnd;
  const overBalance = amountVnd > 0 && amountVnd > cap;
  const canContinue = amountVnd > 0 && !overBalance;

  return (
    <View style={styles.root} testID="vault-pay-amount-screen">
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
          onPress={onBack}
          testID="vault-pay-amount-back-icon"
        >
          <VaultHeaderChip>
            <View style={styles.backIcon}>
              <SFSymbol name="arrow.left" fallback="arrow-back" size={14} color={colors.neutral900} />
            </View>
          </VaultHeaderChip>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onBack}
          testID="vault-pay-amount-back-label"
        >
          <VaultHeaderChip>
            <Text style={styles.backLabel}>{t('Back')}</Text>
          </VaultHeaderChip>
        </Pressable>

        <View style={styles.spacer} />

        <VaultHeaderChip cornerRadius={17}>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceLabel}>{t('Balance')}</Text>
            <Text style={styles.balanceValue}>{`đ${formatWhole(balanceVnd)}`}</Text>
          </View>
        </VaultHeaderChip>
      </View>

      <View style={styles.amountBlock} pointerEvents="none">
        <Text
          style={[
            styles.amount,
            overBalance ? styles.amountOverBalance : amountVnd > 0 ? null : styles.amountEmpty,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          testID="vault-pay-amount-display"
        >
          {formattedAmount}
        </Text>
        <Text style={styles.usdc}>{usdcText}</Text>
      </View>

      <View style={styles.bottom}>
        <View style={styles.recipientRow}>
          <Image source={vietnamFlag} style={styles.flag} />
          <Text style={styles.recipientName} numberOfLines={1} testID="vault-pay-amount-recipient">
            {recipientName}
          </Text>
        </View>

        <View style={styles.keypadCard}>
          <AmountKeypad allowsDecimal={false} onAppend={append} onDelete={del} />

          {overBalance ? (
            <Text style={styles.insufficientText}>{t('Insufficient balance')}</Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !canContinue }}
            disabled={!canContinue}
            onPress={() => onNext(digits)}
            style={[styles.nextButton, !canContinue && styles.nextButtonDisabled]}
            testID="vault-pay-amount-next"
          >
            <Text style={styles.nextText}>{t('Next')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  backIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  backLabel: {
    ...beVietnamPro(15),
    letterSpacing: -0.3,
    color: colors.neutral900,
    width: 61,
    height: 34,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  spacer: { flex: 1 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 34 },
  balanceLabel: { ...beVietnamPro(15), letterSpacing: -0.3, color: colors.neutral900 },
  balanceValue: { ...beVietnamPro(15), letterSpacing: -0.6, color: colors.neutral900 },
  amountBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    paddingBottom: 235,
  },
  amount: { ...beVietnamPro(48), letterSpacing: -2.4, color: colors.contentB },
  amountEmpty: { color: colors.contentL },
  amountOverBalance: { color: colors.secondary },
  usdc: { ...beVietnamPro(14), letterSpacing: -0.56, color: colors.neutral600 },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  recipientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: colors.surface,
    borderRadius: 35,
  },
  flag: { width: 28, height: 28, borderRadius: 14 },
  recipientName: { ...beVietnamPro(16), letterSpacing: -0.32, color: colors.neutral900, flex: 1 },
  keypadCard: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 32,
    gap: 12,
    shadowColor: '#000',
    shadowOpacity: 0.09,
    shadowRadius: 4.5,
  },
  insufficientText: { ...beVietnamPro(13), color: colors.secondary, textAlign: 'center' },
  nextButton: {
    marginHorizontal: 16,
    minHeight: 52,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.black,
  },
  nextButtonDisabled: { backgroundColor: colors.neutral400 },
  nextText: { ...beVietnamPro(17), letterSpacing: -0.68, color: colors.white },
});
