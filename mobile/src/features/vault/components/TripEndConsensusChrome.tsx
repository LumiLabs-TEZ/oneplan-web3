/**
 * Shared chrome for the 3 end-trip consensus screens (Review/Waiting/Denied) — port of
 * `ios/OnePlan/OnePlan/View/Trip/TripEnd/TripEndConsensusChrome.swift`.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppLanguage } from '@/i18n';
import { BackPillButton } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface TripEndBackHeaderProps {
  onBack: () => void;
}

/** Top of the back pill below the status bar — content under it must start past this + 32. */
export const TRIP_END_BACK_TOP_GAP = 8;

/**
 * Web2 back pill (glass arrow + "Back"), floating top-left over the 3 consensus screens' content
 * (same as the wallet / vault result screens).
 */
export function TripEndBackHeader({ onBack }: TripEndBackHeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      style={[styles.backHeaderRow, { top: insets.top + TRIP_END_BACK_TOP_GAP }]}
    >
      <BackPillButton onPress={onBack} testID="trip-end-back" />
    </View>
  );
}

export interface TripEndGoBackButtonProps {
  onPress: () => void;
  title?: string;
  testID?: string;
}

/** Full-width black capsule used on the Waiting / Denied screens. */
export function TripEndGoBackButton({ onPress, title, testID }: TripEndGoBackButtonProps) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <View style={styles.goBackWrap}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={styles.goBackButton}
        testID={testID ?? 'trip-end-go-back'}
      >
        <Text style={styles.goBackText}>{title ?? t('Go back')}</Text>
      </Pressable>
    </View>
  );
}

/** Orange cube cluster — Figma "waiting" glyph. */
export function TripEndWaitingGlyph() {
  return (
    <View
      style={styles.waitingGlyph}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.cube, styles.cubeBottomLeft]} />
      <View style={[styles.cube, styles.cubeBottomRight, styles.cubeDim]} />
      <View style={[styles.cube, styles.cubeTop]} />
    </View>
  );
}

export type TripEndStatusWash = 'waiting' | 'denied';

const GRADIENT_STOPS: Record<TripEndStatusWash, readonly [string, string]> = {
  waiting: ['rgb(180, 223, 255)', 'rgb(251, 236, 215)'],
  denied: ['rgb(255, 180, 182)', 'rgb(251, 215, 215)'],
};

/** Soft top wash behind the Waiting / Denied screens — waiting uses sky, denied uses pink. */
export function TripEndStatusGradient({ kind }: { kind: TripEndStatusWash }) {
  const [top, mid] = GRADIENT_STOPS[kind];
  return (
    <LinearGradient
      colors={[top, mid, colors.background]}
      locations={[0, 0.514, 1]}
      style={styles.statusGradient}
    />
  );
}

const CUBE = 7;
const CUBE_CENTER = (19 - CUBE) / 2;
const ORANGE = 'rgb(255, 140, 64)';

const styles = StyleSheet.create({
  backHeaderRow: {
    position: 'absolute',
    left: spacing.lg,
    zIndex: 1,
  },
  goBackWrap: { paddingHorizontal: spacing.xxl, paddingBottom: spacing.xxl },
  goBackButton: {
    minHeight: 52,
    borderRadius: 999,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  goBackText: { ...beVietnamPro(17), color: colors.white, letterSpacing: -0.68 },
  waitingGlyph: { width: 19, height: 19 },
  cube: {
    position: 'absolute',
    width: CUBE,
    height: CUBE,
    borderRadius: 1.5,
    backgroundColor: ORANGE,
  },
  cubeBottomLeft: { left: CUBE_CENTER - 3, top: CUBE_CENTER + 3 },
  cubeBottomRight: { left: CUBE_CENTER + 3, top: CUBE_CENTER + 3 },
  cubeDim: { opacity: 0.85 },
  cubeTop: { left: CUBE_CENTER, top: CUBE_CENTER - 3 },
  statusGradient: { position: 'absolute', top: 0, left: 0, right: 0, height: 392 },
});
