/**
 * Port of `Component/Trip/TripHistorySection.swift` + `TripHistoryEmpty.swift`:
 * spinner while the first load is in flight, empty card when there is no history,
 * otherwise the grouped list. The trip screens only mount this for the empty/loading states
 * and virtualize the rows themselves (`HistoryListRow`).
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { Spinner } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { TripHistoryList, type TripHistoryListProps } from './TripHistoryList';

export interface TripHistorySectionProps extends TripHistoryListProps {
  isLoading: boolean;
  style?: StyleProp<ViewStyle>;
}

export function TripHistorySection({
  sections,
  isLoading,
  style,
  ...list
}: TripHistorySectionProps) {
  useAppLanguage();
  const { t } = useTranslation();

  if (sections.length === 0) {
    if (isLoading) {
      return (
        <View style={[styles.loading, style]} testID="history-loading">
          <Spinner />
        </View>
      );
    }
    return (
      <View style={[styles.empty, style]} testID="history-empty">
        <Text style={styles.emptyTitle}>{t('No history')}</Text>
        <Text style={styles.emptyBody}>{t('Add a budget or expense to get started')}</Text>
      </View>
    );
  }

  return <TripHistoryList sections={sections} style={style} {...list} />;
}

const styles = StyleSheet.create({
  loading: { minHeight: 100, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  // `flexGrow` fills the rest of the trip-detail viewport (the list row hosting it gets a
  // measured `minHeight`).
  empty: {
    flexGrow: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 24,
    minHeight: 100,
    backgroundColor: colors.surface,
    borderRadius: 24,
  },
  emptyTitle: { ...beVietnamPro(16, 'medium'), color: colors.contentB, textAlign: 'center' },
  emptyBody: { ...beVietnamPro(14), color: colors.contentM, textAlign: 'center' },
});
