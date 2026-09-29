/**
 * Full-screen body of `TripLocationPickerSheet.swift` — header + `LocationSearchContent`. Shared by
 * the create-trip route (`src/app/trip/new/location.tsx`) and the board `DestinationField`, which
 * hosts it in a full-screen `Modal` because a route would present underneath the gorhom portal.
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { components } from '@/api/schema';
import { useAppLanguage } from '@/i18n';
import { GlassIconButton, ScreenContainer } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { LocationSearchContent } from './LocationSearchContent';

export function LocationPickerScreen({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (result: components['schemas']['LocationSearchResultDto']) => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  // `SafeAreaView` reports no top inset inside a `fullScreenModal` — pad from the hook instead,
  // like `paywall.tsx` / `join/[code].tsx`.
  const insets = useSafeAreaInsets();

  return (
    <ScreenContainer edges={[]} style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.headerSpacer} />
        <Text style={styles.headerTitle}>{t('Select Location')}</Text>
        <GlassIconButton
          icon="close"
          label={t('Close')}
          onPress={onClose}
          testID="location-close"
        />
      </View>
      <LocationSearchContent onSelect={onSelect} showsScrollIndicator={false} />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.surface },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  headerSpacer: { width: 40 },
  headerTitle: { ...beVietnamPro(17, 'semibold'), color: colors.contentB },
});
