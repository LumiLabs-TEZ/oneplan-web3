import Compass from '@/assets/images/board/boardCompassIcon.svg';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { svg } from '@/ui/assets';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import type { PinInput } from '../types';
import { SelectionCheck } from './SelectionCheck';
const categories: Record<string, keyof typeof svg.categories> = {
  restaurant: 'FOOD',
  cafe: 'COFFEE',
  bar: 'NIGHT_CLUB',
  hotel: 'STAY',
  shop: 'SHOPPING',
  park: 'PARK',
  beach: 'PARK',
  viewpoint: 'PARK',
  museum: 'TICKET',
  landmark: 'TICKET',
  airport: 'TRANSPORT',
  cinema: 'CINEMA',
  grocery: 'GROCERY',
  gym: 'GYM',
  medical: 'PHARMACY',
  spa: 'SPA',
};
export const PinRow = memo(function PinRow({
  pin,
  selected,
  showsDay = true,
  onPress,
  onLongPress,
  testID,
}: {
  pin: PinInput;
  selected?: boolean;
  showsDay?: boolean;
  onPress: () => void;
  onLongPress?: () => void;
  testID?: string;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const category = categories[pin.category?.toLowerCase() ?? ''];
  const Icon = category ? svg.categories[category] : svg.illustration.appLogoCutout;
  const verified = pin.latitude != null && pin.longitude != null;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      testID={testID}
      accessibilityRole={selected === undefined ? 'button' : 'checkbox'}
      accessibilityState={selected === undefined ? undefined : { checked: selected }}
      style={s.row}
    >
      <View style={s.art}>
        <Icon width={44} height={44} />
      </View>
      <View style={s.body}>
        <View style={s.line}>
          {(showsDay && pin.dayNumber) || pin.timeOfDayText ? (
            <Text style={s.badge} numberOfLines={1}>
              {[
                showsDay && pin.dayNumber ? t('Day %lld', { 0: pin.dayNumber }) : null,
                pin.timeOfDayText,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          ) : null}
          <Text style={s.name} numberOfLines={1}>
            {pin.name}
          </Text>
          {verified ? <Ionicons name="checkmark-circle" size={13} color={colors.blueBase} /> : null}
        </View>
        <View style={s.line}>
          <Compass width={14} height={14} />
          <Text numberOfLines={1} style={s.address}>
            {pin.address ?? pin.notes ?? ''}
          </Text>
        </View>
      </View>
      {selected !== undefined ? <SelectionCheck selected={selected} /> : null}
    </Pressable>
  );
});
const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 20,
  },
  art: {
    width: 60,
    height: 60,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.neutral50,
  },
  body: { flex: 1, gap: 4 },
  line: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  name: { ...beVietnamPro(17), color: colors.contentB, letterSpacing: -0.85, flexShrink: 1 },
  address: { ...beVietnamPro(14), color: colors.contentM, letterSpacing: -0.28, flex: 1 },
  badge: {
    ...beVietnamPro(12, 'medium'),
    letterSpacing: -0.24,
    color: colors.contentB,
    backgroundColor: colors.neutral100,
    borderRadius: 10,
    paddingVertical: 3,
    paddingHorizontal: 8,
    maxWidth: 95,
  },
});
