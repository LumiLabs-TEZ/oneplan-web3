import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, type StyleProp, Text, View, type ViewStyle } from 'react-native';

import { useAppLanguage } from '@/i18n';
import { SectionHeader } from '@/ui/components/SectionHeader';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface QuickAccessSectionProps {
  onCreateTrip: () => void;

  onMissions?: () => void;
  style?: StyleProp<ViewStyle>;
}

const MISSIONS_GRADIENT = ['#FEFFE2', '#FFFFF9'] as const;

export function QuickAccessSection({ onCreateTrip, onMissions, style }: QuickAccessSectionProps) {
  useAppLanguage();
  const { t } = useTranslation();

  return (
    <View style={[styles.section, style]}>
      <SectionHeader title={t('Quick access')} />
      <View style={styles.row}>
        <QuickAccessCard
          title={t('Create new trip')}
          subtitle={t('Let’s create your next trip with friends')}
          buttonTitle={t('New trip')}
          onPress={onCreateTrip}
          illustration={
            <Image
              source={require('../../../../assets/images/missions/homeTripMap.png')}
              style={{ width: 44, height: 44 }}
              contentFit="contain"
            />
          }
          testID="quick-access-create-trip"
        />
        <QuickAccessCard
          title={t('Missions')}
          subtitle={t('Earn %@ for free scans, market plans and Pro.', { 0: '⚡' })}
          buttonTitle={t('See more')}
          onPress={onMissions}
          background={<LinearGradient colors={MISSIONS_GRADIENT} style={StyleSheet.absoluteFill} />}
          illustration={
            <Image
              source={require('../../../../assets/images/missions/rewardTrophy.png')}
              style={{ width: 44, height: 44 }}
              contentFit="contain"
            />
          }
          testID="quick-access-missions"
        />
      </View>
    </View>
  );
}

interface QuickAccessCardProps {
  title: string;
  subtitle: string;
  buttonTitle: string;
  onPress?: () => void;
  disabled?: boolean;
  background?: ReactNode;
  illustration: ReactNode;
  testID?: string;
}

function QuickAccessCard({
  title,
  subtitle,
  buttonTitle,
  onPress,
  disabled = false,
  background,
  illustration,
  testID,
}: QuickAccessCardProps) {
  return (
    <View style={[styles.card, disabled && styles.cardDisabled]} testID={testID}>
      {background}
      <View style={styles.cardTop}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {illustration}
        </View>
        <View style={styles.cardText}>
          <Text style={styles.cardTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={styles.cardSubtitle}>{subtitle}</Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled || !onPress}
        onPress={onPress}
        style={styles.cardButton}
        testID={testID ? `${testID}-button` : undefined}
      >
        <Text style={styles.cardButtonText} numberOfLines={1}>
          {buttonTitle}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  card: {
    flex: 1,
    gap: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  cardDisabled: { opacity: 0.5 },
  cardTop: { flex: 1, gap: 8 },
  cardText: { gap: 6 },
  cardTitle: { ...beVietnamPro(16), color: colors.neutral950, letterSpacing: -0.64 },
  cardSubtitle: { ...beVietnamPro(13), color: colors.neutral600, letterSpacing: -0.65 },
  cardButton: {
    alignSelf: 'stretch',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: colors.black,
    alignItems: 'center',
  },
  cardButtonText: { ...beVietnamPro(14), color: colors.white, letterSpacing: -0.28 },
});
