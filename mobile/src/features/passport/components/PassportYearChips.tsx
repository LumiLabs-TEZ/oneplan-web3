import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface PassportYearChipsProps {
  selectedYear: number | null;
  availableYears: number[];
  onSelect: (year: number | null) => void;
  testID?: string;
}

/** Port of `PassportCard.swift`'s private `PassportYearChips`. "All time" first, then years desc. */
export function PassportYearChips({
  selectedYear,
  availableYears,
  onSelect,
  testID,
}: PassportYearChipsProps) {
  useAppLanguage();
  const { t } = useTranslation();

  // Light haptic on an actual selection change — re-tapping the already-selected chip is a no-op.
  const select = (year: number | null) => {
    if (year === selectedYear) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    onSelect(year);
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      testID={testID}
    >
      <Chip
        label={t('All time')}
        selected={selectedYear === null}
        onPress={() => select(null)}
        testID={testID ? `${testID}-all` : undefined}
      />
      {availableYears.map((year) => (
        <Chip
          key={year}
          label={String(year)}
          selected={selectedYear === year}
          onPress={() => select(year)}
          testID={testID ? `${testID}-${year}` : undefined}
        />
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  selected,
  onPress,
  testID,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      testID={testID}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { flexDirection: 'row', gap: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.neutral100,
  },
  chipSelected: { backgroundColor: colors.neutral950 },
  label: { ...beVietnamPro(14, 'regular'), letterSpacing: -0.42, color: colors.contentM },
  labelSelected: { ...beVietnamPro(14, 'medium'), color: colors.white },
});
