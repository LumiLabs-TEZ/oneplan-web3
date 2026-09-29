/**
 * Absolute-fill blur overlay hosting the `RecordingCard` while a voice note is being recorded.
 * Port of `RecordingModalOverlay` (`ios/OnePlan/OnePlan/Component/Plan/VoiceRecordingComponents.swift
 * :62-102`) and the form-blur wiring at `PlanFormView.swift:81-82` (`blur(radius: 4)` +
 * `allowsHitTesting(false)`). The route renders this as a sibling of the form and toggles the
 * form's `pointerEvents` itself — this component only owns the overlay's own content.
 */
import { BlurView } from 'expo-blur';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { SFSymbol } from '@/ui/components';
import { colors } from '@/ui/theme';

import { RecordingCard } from './RecordingCard';

export interface RecordingOverlayProps {
  visible: boolean;
  title: string;
  seconds: number;
  bars: readonly number[];
  onStop: () => void;
  onClose: () => void;
  /** Bottom edge of the screen's header; iOS lays the card out below the nav bar. */
  topOffset?: number;
  testID?: string;
}

export function RecordingOverlay({
  visible,
  title,
  seconds,
  bars,
  onStop,
  onClose,
  topOffset = 0,
  testID = 'plan-recording-overlay',
}: RecordingOverlayProps) {
  useAppLanguage();
  const { t } = useTranslation();

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} testID={testID}>
      <BlurView intensity={15} style={StyleSheet.absoluteFill} />

      <View style={[styles.cardWrap, { top: topOffset + 44 }]} pointerEvents="box-none">
        <RecordingCard title={title} recording seconds={seconds} bars={bars} onStop={onStop} />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Close')}
        onPress={onClose}
        style={[styles.closeButton, { top: topOffset + 29 }]}
        testID="plan-record-close"
      >
        <SFSymbol name="xmark" fallback="close" size={16} color={colors.contentM} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrap: { position: 'absolute', left: 16, right: 16 },
  closeButton: {
    position: 'absolute',
    right: 6,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    boxShadow: '0px 4px 8px rgba(0, 0, 0, 0.2)',
  },
});
