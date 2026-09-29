/**
 * End-trip consensus: someone denied — port of
 * `ios/OnePlan/OnePlan/View/Trip/TripEnd/TripEndDeniedView.swift`. Figma `4575:15260`.
 *
 * The trip stays ONGOING — a denial only clears the pending end-request so "End trip" can be
 * pressed again later; it does not end or block the trip.
 */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import type { TripEndRequestDto } from '@/features/vault/api/endTrip';
import {
  TripEndBackHeader,
  TripEndGoBackButton,
  TripEndStatusGradient,
} from '@/features/vault/components/TripEndConsensusChrome';
import { useAppLanguage } from '@/i18n';
import { colors, radius, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface TripEndDeniedScreenProps {
  request: TripEndRequestDto;
  onDismiss: () => void;
}

export function TripEndDeniedScreen({ request, onDismiss }: TripEndDeniedScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={styles.root} testID="trip-end-denied-screen">
      <TripEndStatusGradient kind="denied" />

      <TripEndBackHeader onBack={onDismiss} />

      <View style={styles.center}>
        <Ionicons name="alert-circle" size={19} color={colors.secondary} />
        <View style={styles.copy}>
          <Text style={styles.title}>{t('Someone denied')}</Text>
          <Text style={styles.body}>
            {t(
              'There has been a rejection. Please check the transactions and then perform the "End Trip" action again.',
            )}
          </Text>
        </View>

        <View style={styles.memberListOuter}>
          <View style={styles.memberList}>
            {request.members.map((member) => (
              <View key={member.userId} style={styles.memberRow} testID="trip-end-denied-member">
                <Text style={styles.memberName} numberOfLines={1}>
                  {member.displayName}
                </Text>
                <MemberDecision decision={member.decision ?? null} />
              </View>
            ))}
          </View>
        </View>
      </View>

      <TripEndGoBackButton onPress={onDismiss} testID="trip-end-denied-go-back" />
    </View>
  );
}

function MemberDecision({ decision }: { decision: 'APPROVED' | 'DENIED' | null }) {
  const { t } = useTranslation();
  if (decision === 'APPROVED') {
    return (
      <View style={styles.decisionRow}>
        <Ionicons name="checkmark-circle" size={16} color={colors.green400} />
        <Text style={styles.decisionText}>{t('Approved')}</Text>
      </View>
    );
  }
  if (decision === 'DENIED') {
    return (
      <View style={styles.decisionRow}>
        <Ionicons name="alert-circle" size={16} color={colors.secondary} />
        <Text style={styles.decisionText}>{t('Denied')}</Text>
      </View>
    );
  }
  return <Text style={styles.waitingText}>{t('Waiting')}</Text>;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, gap: 19 },
  copy: { alignItems: 'center', gap: 3 },
  title: { ...beVietnamPro(20), color: colors.neutral950, letterSpacing: -0.8, textAlign: 'center' },
  body: {
    ...beVietnamPro(14),
    color: colors.contentM,
    letterSpacing: -0.42,
    textAlign: 'center',
  },
  memberListOuter: {
    alignSelf: 'stretch',
    marginTop: 28 - 19,
    padding: spacing.sm,
    backgroundColor: '#EFEFEF',
    borderRadius: 26,
  },
  memberList: {
    padding: spacing.lg,
    gap: spacing.lg,
    backgroundColor: colors.white,
    borderRadius: radius.xl,
  },
  memberRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  memberName: {
    ...beVietnamPro(15),
    color: colors.contentM,
    letterSpacing: -0.45,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  decisionRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  decisionText: { ...beVietnamPro(16), color: '#393939', letterSpacing: -0.32 },
  waitingText: { ...beVietnamPro(16), color: colors.contentM, letterSpacing: -0.32 },
});
