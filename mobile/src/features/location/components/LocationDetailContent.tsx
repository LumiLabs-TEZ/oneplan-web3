/**
 * Detail content for `LocationSheet`: summary pill strip, 24pt name + pinned address, and "Add
 * to plan" (pick mode only). Returning to search is the map's back chevron (`LocationHeader`),
 * as on iOS. Port of `LocationDetailView.detailSheetContent`
 * (`ios/OnePlan/OnePlan/View/LocationDetailView.swift:533-570`) +
 * `LocationDetailHeaderSection.swift`.
 */
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppLanguage } from '@/i18n';
import { Button } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { LocationSummaryStrip } from './LocationSummaryStrip';

export interface LocationDetailPlace {
  name: string;
  address: string | null;
  category: string | null;
}

export interface LocationDetailContentProps {
  place: LocationDetailPlace;
  /** `'view'` hides the "Add to plan" button. */
  mode: 'pick' | 'view';
  /** Formatted distance from the user (`formatLocationDistance`), `null` without a fix. */
  distanceText: string | null;
  onAddToPlan: () => void;
  /** Reports the content's natural height so the sheet can rest exactly around it. */
  onContentHeight?: (height: number) => void;
  testID?: string;
}

export function LocationDetailContent({
  place,
  mode,
  distanceText,
  onAddToPlan,
  onContentHeight,
  testID,
}: LocationDetailContentProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const { bottom: bottomInset } = useSafeAreaInsets();

  return (
    <BottomSheetScrollView
      contentContainerStyle={[styles.root, { paddingBottom: bottomInset + 12 }]}
      onContentSizeChange={(_width, height) => onContentHeight?.(height)}
      testID={testID}
    >
      <LocationSummaryStrip distanceText={distanceText} locationName={place.name} />

      <Text style={styles.title}>{place.name}</Text>
      {place.address ? (
        <View style={styles.addressRow}>
          <View style={styles.addressIcon}>
            <Ionicons name="location-outline" size={15} color={colors.contentM} />
          </View>
          <Text style={styles.address} numberOfLines={2}>
            {place.address}
          </Text>
        </View>
      ) : null}

      {mode === 'pick' ? (
        <Button
          title={t('Add to plan')}
          onPress={onAddToPlan}
          style={styles.addButton}
          testID="location-add"
        />
      ) : null}
    </BottomSheetScrollView>
  );
}

const styles = StyleSheet.create({
  root: { paddingHorizontal: 16, paddingTop: 12 },
  title: { ...beVietnamPro(24, 'medium'), color: colors.contentB },
  addressRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 5 },
  addressIcon: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  address: { flex: 1, ...beVietnamPro(14), color: colors.contentM, lineHeight: 20 },
  addButton: { marginTop: 22 },
});
