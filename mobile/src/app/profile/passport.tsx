/**
 * Passport screen — port of `View/Profile/PassportView.swift`: year filter, MRZ card, top-cities /
 * top-countries distribution bars, and share-to-IG-Stories / Message / Photos. A hidden
 * `PassportRenderHost` mounts a `render`-variant card off-screen purely so `usePassportShare` can
 * capture it to a PNG.
 */
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { usePassportSummary } from '@/features/passport/api/queries';
import {
  PassportCard,
  PassportDistributionSection,
  PassportRenderHost,
} from '@/features/passport/components';
import { availableYears } from '@/features/passport/helpers/years';
import { PLACEHOLDER_SUMMARY } from '@/features/passport/helpers/distribution';
import { usePassportShare } from '@/features/passport/usePassportShare';
import { useAppLanguage } from '@/i18n';
import { useServingCached } from '@/offline/servingCached';
import { OfflineBanner, ScreenContainer } from '@/ui/components';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

// iOS literal fallback ("04"/"03") shown while the summary is still loading
// (`PassportView.swift`'s `totalCitiesValue`/`totalCountriesValue`) — `citiesCount`/
// `countriesCount` are separate fields from `topCities`/`topCountries` (a capped top-N list), so
// the placeholder total isn't derived from the placeholder rows' length.
const PLACEHOLDER_CITIES_TOTAL = 4;
const PLACEHOLDER_COUNTRIES_TOTAL = 3;

export default function ProfilePassportScreen() {
  useAppLanguage();
  const { t } = useTranslation();
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const passport = usePassportSummary(selectedYear);
  const summary = passport.data ?? null;
  const servingCached = useServingCached(passport);

  const hostRef = useRef<View>(null);
  const { share } = usePassportShare(hostRef);

  const years = availableYears(summary?.memberSince ?? null, new Date());

  const cityRows = summary
    ? summary.topCities.map((city) => ({ label: city.name, count: city.count }))
    : PLACEHOLDER_SUMMARY.cities;
  const countryRows = summary
    ? summary.topCountries.map((country) => ({ label: country.name, count: country.count }))
    : PLACEHOLDER_SUMMARY.countries;
  const citiesTotal = summary ? summary.citiesCount : PLACEHOLDER_CITIES_TOTAL;
  const countriesTotal = summary ? summary.countriesCount : PLACEHOLDER_COUNTRIES_TOTAL;

  return (
    <ScreenContainer style={styles.root}>
      <View testID="passport-screen" style={styles.flex}>
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.title} numberOfLines={1}>
            {t('Passport')}
          </Text>
          <View style={styles.headerButton} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {servingCached ? <OfflineBanner cachedAt={passport.dataUpdatedAt} /> : null}

          <PassportCard
            summary={summary}
            variant="full"
            years={years}
            selectedYear={selectedYear}
            onSelectYear={setSelectedYear}
            onShare={share}
            testID="passport-screen-card"
          />

          <View style={styles.insights}>
            <PassportDistributionSection
              title={t('Top Cities')}
              total={citiesTotal}
              totalSuffix={t('cities')}
              rows={cityRows}
              testID="passport-dist-cities"
            />
            <PassportDistributionSection
              title={t('Countries & Territories')}
              total={countriesTotal}
              totalSuffix={t('total')}
              rows={countryRows}
              testID="passport-dist-countries"
            />
          </View>
        </ScrollView>

        <PassportRenderHost summary={summary} hostRef={hostRef} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  headerButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { ...beVietnamPro(17, 'medium'), color: colors.contentB, flex: 1, textAlign: 'center' },
  content: {
    padding: spacing.md,
    gap: spacing.xxxl,
    paddingBottom: spacing.xxxl,
  },
  insights: { gap: spacing.xxxl },
});
