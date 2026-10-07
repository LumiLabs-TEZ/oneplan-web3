/**
 * Settings screen — port of `View/SettingView.swift`. Delete account (M2.3) row is wired to
 * `useDeleteAccount` (`src/features/settings/useDeleteAccount.ts`).
 */
import { useAdPrivacy, showAdPrivacyOptions } from '@/native/ads/ads';
import { onlineManager } from '@tanstack/react-query';
import * as Application from 'expo-application';
import { router } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import * as Updates from 'expo-updates';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';
import { Alert, Linking, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mutationErrorMessage } from '@/api/mutationError';
import { signOutEverywhere } from '@/auth/session';
import { useCurrencies, CURRENCY_CATALOG_FALLBACK } from '@/features/currency/api/queries';
import { useUpdateProfile } from '@/features/me/api/mutations';
import { useIsPro, useMe } from '@/features/me/useMe';
import { applyLanguageChange } from '@/features/settings/applyLanguageChange';
import {
  EditDisplayNameSheet,
  type EditDisplayNameSheetRef,
  LanguagePickerSheet,
  type LanguagePickerSheetRef,
  PremiumCard,
  SettingRow,
  SettingSectionCard,
  SettingsFooter,
} from '@/features/settings/components';
import {
  SETTING_SECTIONS,
  SETTINGS_URLS,
  type SettingRowId,
} from '@/features/settings/helpers/sections';
import {
  isUpdateBusy,
  updateBuildLabel,
  updateStatusLabel,
} from '@/features/settings/helpers/appUpdate';
import { versionLabel } from '@/features/settings/helpers/serverCommit';
import { useAppUpdate } from '@/features/settings/useAppUpdate';
import { useDeleteAccount } from '@/features/settings/useDeleteAccount';
import { useServerCommit } from '@/features/settings/useServerCommit';
import {
  CurrencyPickerSheet,
  type CurrencyPickerCode,
  type CurrencyPickerSheetRef,
} from '@/features/trip/components/CurrencyPickerSheet';
import { setAppLanguage, useAppLanguage } from '@/i18n';
import { requireOnline } from '@/offline/guardOnline';
import { BackButton } from '@/ui/components/BackButton';
import { colors, spacing } from '@/ui/theme';

/** `GlassIconButton` diameter — the floating header's row height. */
const HEADER_ROW = 45;

export default function SettingsScreen() {
  const adPrivacyRequired = useAdPrivacy((s) => s.required);
  const language = useAppLanguage();
  const { t } = useTranslation();
  const me = useMe();
  const isPro = useIsPro();
  const updateProfile = useUpdateProfile();
  const currencyCatalog = useCurrencies().data ?? CURRENCY_CATALOG_FALLBACK;
  const commit = useServerCommit();
  const insets = useSafeAreaInsets();
  const appUpdate = useAppUpdate();
  const updateBusy = isUpdateBusy(appUpdate.status);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [tripTipsOptimistic, setTripTipsOptimistic] = useState<boolean | null>(null);
  const deleteAccount = useDeleteAccount();

  const displayNameSheetRef = useRef<EditDisplayNameSheetRef>(null);
  const currencySheetRef = useRef<CurrencyPickerSheetRef>(null);
  const languageSheetRef = useRef<LanguagePickerSheetRef>(null);

  const profile = me.data;
  const tripTipsEnabled = tripTipsOptimistic ?? profile?.engagementPushEnabled ?? false;
  const currency = currencyCatalog.find((c) => c.code === profile?.preferredCurrency);
  const currencyLabel = currency ? `${currency.code} (${currency.symbol})` : undefined;

  const handleUpdateProfileError = (err: unknown) => {
    Alert.alert(mutationErrorMessage(err, t('Something went wrong')));
  };

  const handleDisplayNameCommit = (value: string) => {
    if (!requireOnline(t)) return;
    updateProfile.mutate(
      { displayName: value },
      {
        onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
        onError: handleUpdateProfileError,
      },
    );
  };

  const handleCurrencyConfirm = (code: CurrencyPickerCode | null) => {
    if (!code) return;
    if (!requireOnline(t)) return;
    updateProfile.mutate({ preferredCurrency: code }, { onError: handleUpdateProfileError });
  };

  const handleLanguageConfirm = (lang: 'en' | 'vi') => {
    applyLanguageChange(lang, {
      setAppLanguage,
      isOnline: () => onlineManager.isOnline(),
      syncLocale: (locale) => updateProfile.mutate({ locale }, { onError: () => undefined }),
    });
  };

  const handleTripTipsToggle = (value: boolean) => {
    if (!requireOnline(t)) return;
    setTripTipsOptimistic(value);
    updateProfile.mutate(
      { engagementPushEnabled: value, engagementConsent: value ? true : undefined },
      {
        onError: () => setTripTipsOptimistic(!value),
        onSuccess: () => setTripTipsOptimistic(null),
      },
    );
  };

  const handleRate = async () => {
    if (await StoreReview.hasAction()) {
      await StoreReview.requestReview();
    }
  };

  const handleLogOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOutEverywhere();
    } finally {
      setIsSigningOut(false);
    }
  };

  const handlePress = (id: SettingRowId) => {
    switch (id) {
      case 'displayName':
        displayNameSheetRef.current?.present();
        return;
      case 'currency':
        currencySheetRef.current?.present();
        return;
      case 'language':
        languageSheetRef.current?.present();
        return;
      case 'privacy':
        void Linking.openURL(SETTINGS_URLS.privacy);
        return;
      case 'terms':
        void Linking.openURL(SETTINGS_URLS.terms);
        return;
      case 'rate':
        void handleRate();
        return;
      case 'support':
        void Linking.openURL(SETTINGS_URLS.support);
        return;
      case 'logout':
        void handleLogOut();
        return;
      case 'delete':
        deleteAccount.run();
        return;
      default:
        return;
    }
  };

  const trailingFor = (id: SettingRowId): string | undefined => {
    if (id === 'displayName') return profile?.displayName ?? t('One Plan User');
    if (id === 'currency') return currencyLabel;
    if (id === 'language') return language === 'vi' ? 'Tiếng Việt' : 'English';
    return undefined;
  };

  return (
    <View style={styles.root} testID="settings-screen">
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 6 + HEADER_ROW + spacing.sm },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <PremiumCard isPro={isPro} onPress={() => router.push('/paywall')} />

        {SETTING_SECTIONS.map((section) => (
          <SettingSectionCard
            key={section.id}
            icon={section.icon}
            title={t(section.titleKey)}
            testID={`settings-section-${section.id}`}
          >
            {section.rows.map((row) => (
              <SettingRow
                key={row.id}
                icon={row.icon}
                title={t(row.titleKey)}
                trailing={trailingFor(row.id)}
                disclosure={row.disclosure}
                destructive={row.destructive}
                toggle={
                  row.id === 'tripTips'
                    ? { value: tripTipsEnabled, onChange: handleTripTipsToggle }
                    : undefined
                }
                loading={
                  (row.id === 'logout' && isSigningOut) ||
                  (row.id === 'delete' && deleteAccount.pending)
                }
                disabled={
                  (row.id === 'logout' && isSigningOut) ||
                  (row.id === 'delete' && deleteAccount.pending)
                }
                onPress={() => handlePress(row.id)}
                testID={`setting-${ROW_TEST_ID[row.id]}`}
              />
            ))}
            {section.id === 'oneplan' && adPrivacyRequired ? (
              <SettingRow
                icon={{ sf: 'hand.raised.fill', ionicon: 'hand-left', symbolSize: 18 }}
                title={t('Ad privacy options')}
                disclosure
                onPress={() => {
                  if (requireOnline(t))
                    void showAdPrivacyOptions().catch(() => Alert.alert(t('Something went wrong')));
                }}
              />
            ) : null}
            {section.id === 'about' ? (
              <SettingRow
                icon={{ sf: 'arrow.triangle.2.circlepath', ionicon: 'refresh', symbolSize: 18 }}
                title={t('Check for updates')}
                trailing={updateStatusLabel(appUpdate.status, t)}
                loading={updateBusy}
                disabled={updateBusy}
                onPress={() => {
                  if (requireOnline(t)) void appUpdate.check();
                }}
                testID="setting-check-updates"
              />
            ) : null}
          </SettingSectionCard>
        ))}

        <SettingsFooter
          versionLabel={versionLabel(
            Application.nativeApplicationVersion,
            Application.nativeBuildVersion,
            t,
          )}
          commit={commit}
          updateLabel={updateBuildLabel(Updates)}
        />
      </ScrollView>
      {/* Floats over the scroll content (like iOS's toolbar glass buttons) instead of sitting
            in a band that clips it; rendered after the ScrollView so it stays on top. */}
      <View pointerEvents="box-none" style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <BackButton testID="settings-back" />
      </View>

      <EditDisplayNameSheet
        ref={displayNameSheetRef}
        initial={profile?.displayName ?? ''}
        saving={updateProfile.isPending}
        onCommit={handleDisplayNameCommit}
      />
      <CurrencyPickerSheet
        ref={currencySheetRef}
        selected={profile?.preferredCurrency ?? null}
        onConfirm={handleCurrencyConfirm}
        testIDPrefix="setting-currency"
      />
      <LanguagePickerSheet
        ref={languageSheetRef}
        value={language}
        onConfirm={handleLanguageConfirm}
      />
    </View>
  );
}

/** `SettingRowId` -> testID suffix, matching the brief's exact list (`setting-display-name`,
 * `setting-trip-tips`, `setting-delete-account`, …). */
const ROW_TEST_ID: Record<SettingRowId, string> = {
  displayName: 'display-name',
  currency: 'currency',
  language: 'language',
  tripTips: 'trip-tips',
  privacy: 'privacy',
  terms: 'terms',
  rate: 'rate',
  support: 'support',
  logout: 'logout',
  delete: 'delete-account',
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.md },
});
