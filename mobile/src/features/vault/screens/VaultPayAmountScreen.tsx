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
import { useReducer } from 'react';
import { useTranslation } from 'react-i18next';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppLanguage } from '@/i18n';
import { AmountKeypad, BackPillButton, GlassSurface } from '@/ui/components';
import {
  initialKeypadState,
  keypadReducer,
} from '@/features/expense/keypad/keypadReducer';
import { applyLiveFormatting, CURRENCIES, formatWhole } from '@/lib/currency';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const vietnamFlag = require('@/assets/images/vault/flagVietnam.png') as number;

export interface VaultPayAmountScreenProps {
  /** `'…'` while `lookupVaultRecipient` is still in flight — never blocks the screen. */
  recipientName: string;
  /**
   * The group's money, shown in the header "Balance" chip. An amount above it is only tinted, never
   * blocked: the payer is chosen on the next step, where the group is greyed out if it can't cover
   * the amount.
   */
  balanceVnd: number;
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
  prefilledAmountVnd,
  indicativeRate,
  onBack,
  onNext,
}: VaultPayAmountScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();
  // Shown inside the pay flow's full-screen modal, so the header clears the status bar itself.
  const insets = useSafeAreaInsets();
  // Same keypad (and input rules) as add-expense / add-budget. VND has no decimals, so the dot
  // key is disabled. A prefill only applies on mount, as Swift's `.onAppear` did.
  const [keypad, dispatch] = useReducer(keypadReducer, prefilledAmountVnd, (prefill) =>
    initialKeypadState(CURRENCIES.VND, prefill != null ? prefill.toString() : ''),
  );
  const digits = keypad.raw;
  // A code that carries an amount is a bill: the server always charges that amount (VietQR
  // semantics), so letting the payer type another one only ends in a failed quote.
  const amountLocked = prefilledAmountVnd != null;

  const amountVnd = digits === '' ? 0 : Number(digits);
  const formattedAmount = digits === '' ? '0' : applyLiveFormatting(digits, 0);
  const usdcText = indicativeRate > 0 ? `$${(amountVnd / indicativeRate).toFixed(2)}` : '';
  const overBalance = amountVnd > balanceVnd;
  const canContinue = amountVnd > 0;

  return (
    <View style={styles.root} testID="vault-pay-amount-screen">
      <View style={[styles.header, { paddingTop: insets.top + 4 }]}>
        {/* Same header as the web2 keypad screens (add expense / add budget). */}
        <BackPillButton onPress={onBack} testID="vault-pay-amount-back" />
        <View style={styles.balanceShadow}>
          <GlassSurface preset="control" radius={999} style={styles.balancePill}>
            <Text style={styles.balanceText}>
              {`${t('Balance')} đ${formatWhole(balanceVnd)}`}
            </Text>
          </GlassSurface>
        </View>
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
          {amountLocked ? (
            <Text style={styles.lockedNote} testID="vault-pay-amount-locked">
              {t('This QR code sets the amount.')}
            </Text>
          ) : (
            <AmountKeypad state={keypad} dispatch={dispatch} />
          )}

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
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  balanceShadow: { borderRadius: 999, boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.12)' },
  balancePill: { paddingHorizontal: 12, paddingVertical: 8 },
  balanceText: { ...beVietnamPro(15, 'regular'), letterSpacing: -0.3, color: colors.neutral900 },
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
  lockedNote: {
    ...beVietnamPro(14),
    color: colors.neutral600,
    textAlign: 'center',
    paddingVertical: 16,
  },
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
