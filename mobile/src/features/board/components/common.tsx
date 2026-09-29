import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { useEffect, useRef, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { AppSheet, type AppSheetRef } from '@/ui/components/AppSheet';
import { BackButton } from '@/ui/components/BackButton';
import { Button, type ButtonProps } from '@/ui/components/Button';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

/** Measurements follow the corresponding SwiftUI sheet; never a common percentage. */
export function BoardSheet({
  title,
  children,
  onClose,
  height = 500,
  footer,
  plain = false,
  locked = false,
  stackBehavior,
}: {
  title?: string;
  children: ReactNode;
  onClose: () => void;
  height?: number | 'large';
  footer?: ReactNode;
  plain?: boolean;
  locked?: boolean;
  /** Pass `push` when presented over another sheet — see `SavePinsSheet`. */
  stackBehavior?: 'push' | 'switch' | 'replace';
}) {
  const ref = useRef<AppSheetRef>(null);
  const { height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    const sheet = ref.current;
    sheet?.present();
    return () => sheet?.dismiss();
  }, []);
  const snap =
    height === 'large'
      ? screenHeight - insets.top
      : Math.min(height + insets.bottom, screenHeight - insets.top);
  // ≥90% of the window, `AppSheet` keeps the sheet edge-attached (not floating), so the footer
  // must clear the home indicator itself — like SwiftUI's safe-area-aware bottom overlay.
  const edgeAttached = snap >= screenHeight * 0.9;
  const footerInset = edgeAttached ? insets.bottom : 0;
  return (
    <AppSheet
      ref={ref}
      snapPoints={[snap]}
      blurBackdrop={false}
      backgroundColor={colors.neutral50}
      // iOS 26 large-sheet corners (as `RequestPlanSheet`); floating sheets keep AppSheet's 48.
      backgroundRadius={edgeAttached ? 44 : undefined}
      enablePanDownToClose={!locked}
      dismissOnBackdropPress={!locked}
      onDismiss={onClose}
      stackBehavior={stackBehavior}
      footer={footer ? <View style={{ paddingBottom: footerInset }}>{footer}</View> : undefined}
    >
      <BottomSheetScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={
          plain
            ? { paddingBottom: 20 }
            : [styles.sheetContent, footer ? { paddingBottom: 90 + footerInset } : undefined]
        }
      >
        {title ? <Text style={styles.sheetTitle}>{title}</Text> : null}
        {children}
      </BottomSheetScrollView>
    </AppSheet>
  );
}
export function BoardButton(props: ButtonProps) {
  return (
    <Button
      {...props}
      style={[props.style, props.disabled && { backgroundColor: colors.neutral200, opacity: 1 }]}
      textStyle={[
        beVietnamPro(17),
        { letterSpacing: -0.34 },
        props.textStyle,
        props.disabled && { color: colors.contentL },
      ]}
    />
  );
}
export function BoardNavigation({
  trailing,
  floating = false,
  onHeight,
}: {
  trailing?: ReactNode;
  /** Overlay the content with no background so it scrolls underneath (SwiftUI nav bar). */
  floating?: boolean;
  /** Reports the bar height so a floating bar's content can reserve room for it. */
  onHeight?: (height: number) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents={floating ? 'box-none' : 'auto'}
      onLayout={onHeight ? (e) => onHeight(e.nativeEvent.layout.height) : undefined}
      style={[
        styles.navigation,
        { paddingTop: insets.top + 6 },
        floating && styles.navigationFloating,
      ]}
    >
      <BackButton testID="board-back" />
      {trailing}
    </View>
  );
}
export function QueryError({ onRetry }: { onRetry: () => void }) {
  useAppLanguage();
  const { t } = useTranslation();
  return (
    <View style={styles.card}>
      <Text style={styles.error}>{t('Please check your connection and try again.')}</Text>
      <BoardButton title={t('Try again')} variant="secondary" onPress={onRetry} />
    </View>
  );
}
export const styles = StyleSheet.create({
  content: { padding: 16, gap: 8, paddingBottom: 96 },
  sheetContent: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 24, gap: 20 },
  sheetTitle: {
    ...beVietnamPro(20),
    color: colors.neutral950,
    textAlign: 'center',
    letterSpacing: -0.8,
  },
  navigation: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    backgroundColor: colors.background,
  },
  navigationFloating: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  flex: { flex: 1 },
  title: { ...beVietnamPro(20), color: colors.contentB, letterSpacing: -0.8 },
  subtitle: { ...beVietnamPro(17), color: colors.contentB, letterSpacing: -0.85 },
  text: { ...beVietnamPro(14), color: colors.contentB, letterSpacing: -0.28 },
  muted: { ...beVietnamPro(13), color: colors.contentM, letterSpacing: -0.26 },
  section: { ...beVietnamPro(16, 'medium'), color: colors.contentM },
  error: { ...beVietnamPro(13), color: colors.warning500 },
  card: { backgroundColor: colors.surface, borderRadius: 20, padding: 12, gap: 8 },
  input: {
    ...beVietnamPro(15),
    color: colors.contentB,
    padding: 12,
    minHeight: 48,
    backgroundColor: colors.white,
    borderRadius: 12,
  },
  image: { width: 60, height: 60, borderRadius: 15 },
  selected: { borderColor: colors.blueBase, borderWidth: 1 },
  hero: { backgroundColor: '#2999F7', borderRadius: 32, padding: 8, gap: 8 },
});
