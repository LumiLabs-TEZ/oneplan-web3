import type { ColorValue, StyleProp, TextStyle, ViewStyle } from 'react-native';

import { moneyNumericValue, type Currency } from '@/lib/currency';

import { NumericText } from './NumericText';

export type MoneyTextProps = {
  amount: number;
  currency: Currency;
  /** Draw the currency's decimals (`$1,234.50`); `false` draws the truncated whole (`$1,234`). */
  showDecimals?: boolean;
  /** `prefix` → `đ1,234` (`lib/currency` `format`); `suffix` → `1,234đ` (balance rows). */
  symbolPosition?: 'prefix' | 'suffix';
  /** Drawn before everything else, in `style` (`+`, `-`, `~`). */
  sign?: string;
  style?: StyleProp<TextStyle>;
  /** Symbol colour/weight when it differs from the digits (the soft/strong split). */
  symbolStyle?: StyleProp<TextStyle>;
  /** Colour of the decimal mark and cents when they differ from the whole part. */
  decimalColor?: ColorValue;
  /** Shrink-to-fit floor, like `adjustsFontSizeToFit` + `minimumFontScale`. */
  minimumFontScale?: number;
  containerStyle?: StyleProp<ViewStyle>;
  testID?: string;
  /** `false` → one static `<Text>` (list rows); see `NumericText`. */
  animated?: boolean;
};

/**
 * An animated money amount in the app's own format (`lib/currency.ts`): en-US grouping, the
 * whole part truncated like `formatWhole`, the cents like `formatDecimal`, and the catalog symbol
 * (`đ`, `NT$`) rather than the platform's currency formatting.
 */
export function MoneyText({
  amount,
  currency,
  showDecimals = true,
  symbolPosition = 'prefix',
  sign,
  style,
  symbolStyle,
  decimalColor,
  minimumFontScale,
  containerStyle,
  testID,
  animated,
}: MoneyTextProps) {
  const fractionDigits = showDecimals ? currency.decimalPlaces : 0;
  const before = symbolPosition === 'prefix';
  return (
    <NumericText
      value={moneyNumericValue(amount, currency, showDecimals)}
      minimumFractionDigits={fractionDigits}
      maximumFractionDigits={fractionDigits}
      fractionColor={decimalColor}
      minimumFontScale={minimumFontScale}
      style={style}
      prefix={before ? `${sign ?? ''}${currency.symbol}` : sign}
      prefixStyle={before ? symbolStyle : undefined}
      suffix={before ? undefined : currency.symbol}
      suffixStyle={before ? undefined : symbolStyle}
      containerStyle={containerStyle}
      testID={testID}
      animated={animated}
    />
  );
}
