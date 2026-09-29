/**
 * Overlay header for the location-detail map: a glass back chevron (`ToolbarIconButton`,
 * `LocationDetailView.swift:433-456`). The compass and plan-count pills that used to sit here
 * now live where iOS draws them — the compass floats above the sheet (`LocationScreen`) and the
 * plan count is in the sheet's summary strip (`LocationSummaryStrip`).
 */
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppLanguage } from '@/i18n';
import { GlassIconButton } from '@/ui/components';
import { spacing } from '@/ui/theme';

export interface LocationHeaderProps {
  /** Returns to search from picker detail, otherwise dismisses — the screen decides. */
  onBack: () => void;
}

export function LocationHeader({ onBack }: LocationHeaderProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
      <GlassIconButton
        label={t('Back')}
        icon="chevron-back"
        onPress={onBack}
        testID="location-close"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    paddingHorizontal: spacing.lg,
  },
});
