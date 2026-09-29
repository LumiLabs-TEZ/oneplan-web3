/**
 * End-trip consensus: waiting for other members — port of
 * `ios/OnePlan/OnePlan/View/Trip/TripEnd/TripEndWaitingView.swift`. Figma `4575:1957`.
 */
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { useTripEndRequest, type TripEndRequestDto } from '@/features/vault/api/endTrip';
import {
  TripEndBackHeader,
  TripEndGoBackButton,
  TripEndStatusGradient,
  TripEndWaitingGlyph,
} from '@/features/vault/components/TripEndConsensusChrome';
import { outcomeAfterRequestUpdate } from '@/features/vault/helpers/tripEndConsensus';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface TripEndWaitingScreenProps {
  tripId: number;
  onBack: () => void;
  onAllApproved: () => void;
  onDenied: (request: TripEndRequestDto) => void;
}

export function TripEndWaitingScreen({
  tripId,
  onBack,
  onAllApproved,
  onDenied,
}: TripEndWaitingScreenProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const request = useTripEndRequest(tripId);

  useEffect(() => {
    if (!request.data) return;
    const outcome = outcomeAfterRequestUpdate(request.data);
    if (outcome === 'ended') onAllApproved();
    else if (outcome === 'denied') onDenied(request.data);
    // Re-run only when the request's own identity/status actually changes — not on every
    // background refetch that returns an unchanged PENDING snapshot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request.data?.status]);

  return (
    <View style={styles.root} testID="trip-end-waiting-screen">
      <TripEndStatusGradient kind="waiting" />

      <TripEndBackHeader onBack={onBack} />

      <View style={styles.center}>
        <TripEndWaitingGlyph />
        <View style={styles.copy}>
          <Text style={styles.title}>{t('Waiting for others to approve.')}</Text>
          <Text style={styles.body}>
            {t('You have confirmed. Please wait for other members to confirm their transactions.')}
          </Text>
        </View>
      </View>

      <TripEndGoBackButton onPress={onBack} testID="trip-end-waiting-go-back" />
    </View>
  );
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
});
