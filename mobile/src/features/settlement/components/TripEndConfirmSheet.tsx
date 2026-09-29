/**
 * "Are you confirm that you've received/paid …" — port of
 * `Component/BottomSheet/TripEndConfirmBottomSheet.swift` (fixed 392pt detent).
 * Purely presentational: the caller owns the settle mutation and dismisses on success.
 */
import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { AppSheet, type AppSheetRef, Button, DismissButton, MoneyText } from '@/ui/components';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

const RECEIVE_TILE = 'rgb(179, 237, 219)';
const PAY_TILE = 'rgb(237, 179, 179)';

export interface TripEndConfirmSheetProps {
  amount: number;
  currency: Currency;
  isReceiving: boolean;
  confirming?: boolean;
  onConfirm: () => void;
}

export interface TripEndConfirmSheetRef {
  present: () => void;
  dismiss: () => void;
}

export const TripEndConfirmSheet = forwardRef<TripEndConfirmSheetRef, TripEndConfirmSheetProps>(
  function TripEndConfirmSheet(
    { amount, currency, isReceiving, confirming = false, onConfirm },
    ref,
  ) {
    useAppLanguage();
    const { t } = useTranslation();
    const sheetRef = useRef<AppSheetRef>(null);

    useImperativeHandle(ref, () => ({
      present: () => sheetRef.current?.present(),
      dismiss: () => sheetRef.current?.dismiss(),
    }));

    return (
      <AppSheet ref={sheetRef} snapPoints={[392]}>
        <View style={styles.container} testID="trip-end-confirm-sheet">
          <View style={styles.header}>
            <DismissButton
              onPress={() => sheetRef.current?.dismiss()}
              accessibilityLabel={t('Close')}
            />
          </View>

          <View style={styles.body}>
            <View style={[styles.tile, { backgroundColor: isReceiving ? RECEIVE_TILE : PAY_TILE }]}>
              <Ionicons
                name={isReceiving ? 'download-outline' : 'push-outline'}
                size={42}
                color={colors.surface}
              />
            </View>
            <Text style={styles.copy}>
              {isReceiving
                ? t("Are you confirm that you've received")
                : t("Are you confirm that you've paid")}
            </Text>
            <MoneyText
              amount={amount}
              currency={currency}
              style={styles.amountStrong}
              symbolStyle={styles.amountSymbol}
              decimalColor={colors.contentL}
            />
          </View>

          <Button
            title={t('Confirm')}
            loading={confirming}
            onPress={onConfirm}
            style={styles.confirm}
            testID="trip-end-confirm-button"
          />
        </View>
      </AppSheet>
    );
  },
);

const styles = StyleSheet.create({
  container: { flex: 1, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: spacing.lg },
  body: { flex: 1, alignItems: 'center', gap: spacing.sm, paddingTop: 18 },
  tile: {
    width: 80,
    height: 80,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.lg,
  },
  copy: { ...beVietnamPro(14), color: colors.contentB, textAlign: 'center' },
  // The symbol keeps the old row's 3pt gap; the cents are drawn inside the number itself.
  amountSymbol: { color: colors.contentL, marginRight: 3 },
  amountStrong: { ...beVietnamPro(36), color: colors.contentB },
  confirm: { marginHorizontal: spacing.lg },
});
