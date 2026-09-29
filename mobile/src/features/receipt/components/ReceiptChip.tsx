import { Platform, StyleSheet, Text, View } from 'react-native';
import type { Currency } from '@/lib/currency';
import { MoneyText, NumericText } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import type { ReceiptItem } from '../assignment';

// Android uses the owner-approved bundled face; iOS retains DnDBillItemsView's font.
export const receiptNumberFont =
  Platform.OS === 'ios'
    ? { fontFamily: 'SF Compact Rounded', fontWeight: '500' as const }
    : { fontFamily: beVietnamPro(14, 'medium').fontFamily };
export function ReceiptChip({
  item,
  currency,
  remaining = 1,
}: {
  item: ReceiptItem;
  currency: Currency;
  remaining?: number;
}) {
  return (
    <View style={styles.chip}>
      <View style={styles.nameRow}>
        <Text numberOfLines={1} style={styles.name}>
          {item.name}
        </Text>
        {remaining > 1 || (item.quantity > 1 && remaining > 0) ? (
          <View style={styles.quantity}>
            <NumericText value={remaining} style={styles.quantityText} />
          </View>
        ) : null}
      </View>
      <MoneyText
        amount={item.displayMinor / 10 ** currency.decimalPlaces}
        currency={currency}
        style={styles.price}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 10,
    backgroundColor: colors.blueAlpha10,
    borderRadius: 12,
    borderCurve: 'continuous',
    alignSelf: 'flex-start',
    maxWidth: '100%',
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
  name: { ...beVietnamPro(14), letterSpacing: -0.7, color: colors.contentB, flexShrink: 1 },
  price: { ...receiptNumberFont, fontSize: 14, letterSpacing: -0.7, color: colors.blueBase },
  quantity: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.blueAlpha16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quantityText: { ...beVietnamPro(9.6, 'semibold'), color: colors.blueBase },
});
