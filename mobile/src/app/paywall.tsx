/**
 * Pro paywall — port of `SubscriptionView`/`PaywallView` (SubscriptionView.swift). Screen state
 * lives in `usePaywall`; this file wires it to the layout: header, features card, product picker,
 * primary CTA, promo code, compare-features sheet, restore, and the legal footer.
 */
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  actionLabel,
  autoRenewNoticeLabel,
  productPeriodLabel,
} from '@/features/subscription/helpers/paywall';
import {
  CompareFeaturesSheet,
  type CompareFeaturesSheetRef,
  PaywallHeader,
  PaywallLegalFooter,
  PaywallPoints,
  ProductPicker,
  PromoCodeRow,
} from '@/features/subscription/components';
import { usePaywall } from '@/features/subscription/usePaywall';
import { useAppLanguage } from '@/i18n';
import { MarketTopGlow } from '@/features/market/components/MarketTopGlow';
import { GlassIconButton, GlassSurface, Spinner } from '@/ui/components';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

function PaywallScreenContent() {
  useAppLanguage();
  const { t } = useTranslation();
  const compareSheetRef = useRef<CompareFeaturesSheetRef>(null);

  const {
    loading,
    purchasing,
    hasPendingRetry,
    subs,
    selectedSku,
    selectSku,
    primaryAction,
    onPrimary,
    onClose,
    onRestore,
    onPromo,
    awaitingPromo,
    statusUnavailable,
  } = usePaywall();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();

  if (loading && subs.length === 0) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Spinner fill />
      </View>
    );
  }

  const selectedProduct = subs.find((p) => p.id === selectedSku) ?? null;
  const primaryDisabled = !selectedSku || statusUnavailable || purchasing;

  return (
    <View style={styles.root}>
      {/* `SubscriptionView` `topBlurBackground`. */}
      <MarketTopGlow />
      <View style={styles.flexFill} testID="paywall-screen">
        <ScrollView
          testID="paywall-scroll"
          contentContainerStyle={[
            styles.content,
            {
              paddingTop: insets.top + TOOLBAR_HEIGHT,
              paddingBottom: insets.bottom + spacing.xxxl,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <PaywallHeader />

          {hasPendingRetry ? (
            <View style={styles.pendingBanner} testID="paywall-pending-banner">
              <Text style={styles.pendingBannerText}>
                {t('Could not verify your purchase with the server.')}
              </Text>
            </View>
          ) : null}

          {statusUnavailable ? (
            <View style={styles.pendingBanner} testID="paywall-status-error">
              <Text style={styles.pendingBannerText}>
                {t('Failed to load subscription status')}
              </Text>
            </View>
          ) : null}

          <PaywallPoints selectedSku={selectedSku} />

          <ProductPicker
            products={subs}
            selectedSku={selectedSku}
            onSelect={selectSku}
            onCompareFeaturesTap={() => compareSheetRef.current?.present()}
          />

          {selectedProduct ? (
            <Text style={styles.autoRenewNotice}>
              {autoRenewNoticeLabel(
                selectedProduct.displayPrice,
                productPeriodLabel(selectedProduct, t),
                t,
              )}
            </Text>
          ) : null}

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: primaryDisabled, busy: purchasing }}
            disabled={primaryDisabled}
            onPress={() => void onPrimary()}
            testID="paywall-primary"
            style={({ pressed }) => [
              styles.primaryButton,
              primaryDisabled && styles.primaryDisabled,
              pressed && styles.dimmed,
            ]}
          >
            {purchasing ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={styles.primaryLabel}>{actionLabel(primaryAction, t)}</Text>
            )}
          </Pressable>

          {awaitingPromo ? (
            <Text style={styles.promoStatus}>
              {t('Your code was submitted. Verifying Pro access with the App Store...')}
            </Text>
          ) : (
            <PromoCodeRow onPress={() => void onPromo()} disabled={purchasing} />
          )}

          <View style={styles.footer}>
            <PaywallLegalFooter />
          </View>
        </ScrollView>

        {/* Floats over the scroll content like the tab `AppHeader` (`headerTransparent`). */}
        <View style={[styles.toolbar, { paddingTop: insets.top + TOOLBAR_VERTICAL_PADDING }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: purchasing }}
            disabled={purchasing}
            onPress={() => void onRestore()}
            testID="paywall-restore"
            style={({ pressed }) => [
              styles.restoreShadow,
              (pressed || purchasing) && styles.dimmed,
            ]}
          >
            <GlassSurface preset="control" radius={999} style={styles.restore}>
              <Text style={styles.restoreLabel} numberOfLines={fontScale > 1.3 ? 2 : 1}>
                {t('Restore')}
              </Text>
            </GlassSurface>
          </Pressable>
          <GlassIconButton
            label={t('Close')}
            icon="close"
            testID="paywall-close"
            onPress={onClose}
          />
        </View>

        <CompareFeaturesSheet ref={compareSheetRef} />
      </View>
    </View>
  );
}

export default function PaywallScreen() {
  return (
    // Own provider: the root one's portal host sits below this route's fullScreenModal, so the
    // compare-features sheet presented from here would render behind it and be invisible.
    <BottomSheetModalProvider>
      <PaywallScreenContent />
    </BottomSheetModalProvider>
  );
}

const TOOLBAR_VERTICAL_PADDING = spacing.sm;
/** Toolbar row (40pt glass close button) + its vertical padding, below the safe-area inset. */
const TOOLBAR_HEIGHT = 40 + 2 * TOOLBAR_VERTICAL_PADDING;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white, overflow: 'hidden' },
  flexFill: { flex: 1 },
  toolbar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: TOOLBAR_VERTICAL_PADDING,
  },
  restoreShadow: { borderRadius: 999, flexShrink: 1, boxShadow: '0px 2px 6px rgba(0,0,0,0.10)' },
  restore: { minHeight: 32, paddingHorizontal: 14, justifyContent: 'center' },
  restoreLabel: { fontSize: 13, fontWeight: '600', color: colors.contentB },
  dimmed: { opacity: 0.6 },
  // `PaywallView`: VStack(spacing: 8), `.padding(.horizontal, 15)`.
  content: { paddingHorizontal: 15, paddingBottom: spacing.xxxl, gap: spacing.sm },
  pendingBanner: {
    backgroundColor: colors.blueAlpha10,
    borderRadius: 12,
    padding: spacing.md,
  },
  pendingBannerText: {
    ...beVietnamPro(13, 'regular'),
    color: colors.blueBase,
    textAlign: 'center',
  },
  autoRenewNotice: {
    ...beVietnamPro(14, 'regular'),
    color: colors.contentM,
    textAlign: 'center',
  },
  // `.font(.headline)` on a `Color.primary` capsule, `.padding(.horizontal, 8)`.
  primaryButton: {
    marginHorizontal: spacing.sm,
    minHeight: 54,
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryDisabled: { opacity: 0.5 },
  primaryLabel: { fontSize: 17, fontWeight: '600', color: colors.white, textAlign: 'center' },
  footer: { marginTop: 60, paddingVertical: 5 },
  promoStatus: {
    ...beVietnamPro(13, 'regular'),
    color: colors.contentM,
    textAlign: 'center',
    paddingHorizontal: spacing.sm,
  },
});
