import { NumericText } from '@/ui/components/NumericText';
import { RewardArt } from './RewardArt';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { beVietnamPro } from '@/ui/typography';
import type { Reward } from './api/queries';
import { rewardCatalog, type RewardId } from './catalog';

export function SparkChip({
  children,
  dark = false,
  claimed = false,
  insufficient = false,
  bolt = true,
  trailingBolt = false,
  prefix,
}: {
  /** A number animates via `NumericText`; a string or node renders as-is. */
  children: ReactNode;
  /** Drawn before a numeric child (e.g. "+" on a mission reward); ignored otherwise. */
  prefix?: string;
  dark?: boolean;
  claimed?: boolean;
  insufficient?: boolean;
  bolt?: boolean;
  trailingBolt?: boolean;
}) {
  return (
    <View
      style={[
        styles.chip,
        trailingBolt && { flexDirection: 'row-reverse' },
        dark && styles.dark,
        claimed && styles.claimed,
        insufficient && styles.insufficient,
      ]}
    >
      {bolt ? (
        <Image
          source={require('../../../assets/images/missions/rewardBolt.png')}
          style={{ width: 12, height: 16 }}
          contentFit="contain"
        />
      ) : null}
      {typeof children === 'number' ? (
        <NumericText
          value={children}
          prefix={prefix}
          style={[styles.chipText, dark && { color: 'white' }]}
        />
      ) : typeof children === 'string' ? (
        <Text style={[styles.chipText, dark && { color: 'white' }]}>{children}</Text>
      ) : (
        children
      )}
    </View>
  );
}
export function DashedDivider() {
  return (
    <Svg height={1} width="100%">
      <Line
        x1="0"
        y1="0.5"
        x2="100%"
        y2="0.5"
        stroke="#B5B5B5"
        strokeWidth={1}
        strokeDasharray="4 4"
      />
    </Svg>
  );
}
export function MissionAction({
  title,
  onPress,
  disabled = false,
  blue = false,
  testID,
  compact = false,
}: {
  title: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  blue?: boolean;
  testID?: string;
  compact?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.action,
        compact && { minHeight: 46, paddingVertical: 10, flexBasis: fontScale > 1.3 ? 'auto' : 0 },
        blue && { backgroundColor: '#335CFF' },
        disabled && { backgroundColor: '#999' },
      ]}
    >
      {typeof title === 'string' ? (
        <Text
          style={[
            styles.actionText,
            compact && { fontSize: 16, letterSpacing: 0 },
            compact && blue && { fontFamily: undefined },
          ]}
        >
          {title}
        </Text>
      ) : (
        title
      )}
    </Pressable>
  );
}
export function RewardCard({
  item,
  onPress,
}: {
  item: Reward & { itemId: RewardId };
  onPress: () => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const copy = rewardCatalog[item.itemId];
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t(copy.title)}, ${item.price}`}
      accessibilityState={{ disabled: !item.available }}
      disabled={!item.available}
      onPress={onPress}
      testID={`reward-${item.itemId}`}
    >
      <LinearGradient
        colors={copy.gradient}
        style={[
          styles.card,
          largeText && { width: '100%', height: 'auto', minHeight: 157, gap: 12 },
          !item.available && { opacity: 0.45 },
        ]}
      >
        <View style={[styles.cardTop, largeText && { height: 'auto', gap: 8 }]}>
          <RewardArt
            contentPosition="right center"
            id={item.itemId}
            width={72}
            height={59}
            style={{ alignSelf: 'flex-end' }}
          />
          <View style={largeText ? { alignSelf: 'flex-start' } : { position: 'absolute', left: 0 }}>
            <SparkChip dark>{item.price}</SparkChip>
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <Text numberOfLines={largeText ? undefined : 1} style={styles.cardTitle}>
            {t(copy.title)}
          </Text>
          <Text numberOfLines={largeText ? undefined : 1} style={styles.subtitle}>
            {t(copy.subtitle)}
          </Text>
        </View>
      </LinearGradient>
    </Pressable>
  );
}
export const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { ...beVietnamPro(20, 'medium'), letterSpacing: -0.8, color: '#363636' },
  label: { ...beVietnamPro(14), letterSpacing: -0.28, color: '#7B7B7B' },
  subtitle: { fontSize: 12, color: 'rgba(54,54,54,0.5)' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 100,
    backgroundColor: '#DFDFDF',
    boxShadow: '0px 1px 8px rgba(0,0,0,0.12)',
  },
  dark: { backgroundColor: '#363636' },
  claimed: { opacity: 0.5 },
  insufficient: { backgroundColor: '#E02523' },
  chipText: {
    ...beVietnamPro(15),
    includeFontPadding: false,
    letterSpacing: -0.3,
    color: '#363636',
  },
  card: {
    width: 186,
    height: 157,
    paddingTop: 8,
    paddingBottom: 12,
    paddingHorizontal: 10,
    borderRadius: 20,
    justifyContent: 'space-between',
    overflow: 'hidden',
  },
  cardTop: { height: 59 },
  cardTitle: { ...beVietnamPro(15, 'medium'), letterSpacing: -0.3, color: '#363636' },
  action: {
    minHeight: 52,
    borderRadius: 100,
    backgroundColor: '#363636',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    flexGrow: 1,
  },
  actionText: { ...beVietnamPro(17), letterSpacing: -0.68, color: 'white', textAlign: 'center' },
  quantity: { ...beVietnamPro(48), letterSpacing: -2.4, color: '#363636', textAlign: 'center' },
});
