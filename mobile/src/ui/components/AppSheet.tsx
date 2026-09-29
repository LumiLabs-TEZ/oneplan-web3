import { Ionicons } from '@expo/vector-icons';
import {
  BottomSheetBackdrop,
  type BottomSheetBackgroundProps,
  type BottomSheetBackdropProps,
  BottomSheetFooter,
  type BottomSheetFooterProps,
  BottomSheetModal,
  type BottomSheetModalProps,
} from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import { forwardRef, useMemo, type ReactNode, type RefObject } from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';

import { GlassSurface } from './GlassSurface';
import { sheetPresets, type SheetPreset } from './sheetPresets';
import { Button } from '@/ui/components/Button';
import { colors, radius } from '@/ui/theme';

export type AppSheetRef = BottomSheetModal;

export interface AppSheetProps extends Pick<
  BottomSheetModalProps,
  | 'enableDynamicSizing'
  | 'onDismiss'
  | 'onChange'
  | 'enablePanDownToClose'
  | 'enableContentPanningGesture'
  | 'stackBehavior'
  | 'handleStyle'
  | 'handleIndicatorStyle'
  | 'bottomInset'
  | 'topInset'
  | 'style'
  | 'detached'
  | 'android_keyboardInputMode'
> {
  preset?: SheetPreset;
  snapPoints?: BottomSheetModalProps['snapPoints'];
  children: ReactNode;
  /** Rendered in a `BottomSheetFooter`, which rides above the keyboard (primary buttons). */
  footer?: ReactNode;
  /** Overrides the sheet background corner radius (default `radius.xxl`). */
  backgroundRadius?: number;
  backgroundColor?: string;
  dismissOnBackdropPress?: boolean;
  blurBackdrop?: boolean;
  backdropOpacity?: number;
  blurTarget?: RefObject<View | null>;
  material?: 'solid' | 'glass';
  /**
   * iOS 26 floating sheet: inset from the screen edges with large corners. Defaults to `true`
   * unless the top snap point is ≥90% of the window — a percentage or a pixel height (iOS `.large`,
   * which stays edge-attached; detaching it lifts the sheet and locks its scrollables).
   */
  floating?: boolean;
}

/** Measured on the iOS 26 runtime (rewards sheets) — shared by every floating sheet. */
const FLOATING = {
  detached: true,
  bottomInset: 9,
  style: { marginHorizontal: 8 },
  backgroundRadius: 48,
} as const;

function isLargeDetent(snapPoints: BottomSheetModalProps['snapPoints']): boolean {
  const points = Array.isArray(snapPoints) ? snapPoints : [];
  const top = points[points.length - 1];
  if (typeof top === 'number') return top >= Dimensions.get('window').height * 0.9;
  return typeof top === 'string' && top.endsWith('%') && parseFloat(top) >= 90;
}

export function GlassSheetBackground({
  style,
  cornerRadius,
  blurTarget,
}: BottomSheetBackgroundProps & { cornerRadius: number; blurTarget?: RefObject<View | null> }) {
  return (
    <View pointerEvents="none" style={style}>
      <GlassSurface
        preset="sheet"
        radius={cornerRadius}
        blurTarget={blurTarget}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}

function SheetBackdrop(
  props: BottomSheetBackdropProps & {
    dismissOnPress?: boolean;
    blur?: boolean;
    dimOpacity?: number;
  },
) {
  return (
    <BottomSheetBackdrop
      {...props}
      pressBehavior={props.dismissOnPress === false ? 'none' : 'close'}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={1}
      style={[props.style, styles.backdrop]}
    >
      {Platform.OS === 'ios' && props.blur !== false ? (
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      ) : (
        <View
          style={[
            StyleSheet.absoluteFill,
            { backgroundColor: `rgba(0, 0, 0, ${props.dimOpacity ?? 0.4})` },
          ]}
        />
      )}
    </BottomSheetBackdrop>
  );
}

function resolveProps(props: AppSheetProps): AppSheetProps {
  const merged: AppSheetProps = { ...(props.preset ? sheetPresets[props.preset] : {}), ...props };
  const floating = merged.floating ?? !isLargeDetent(merged.snapPoints);
  return floating ? { ...FLOATING, ...merged } : merged;
}

/**
 * Modal bottom sheet with a blurred backdrop. Present via `ref.current?.present()`.
 * Requires a `BottomSheetModalProvider` above (root layout).
 */
export const AppSheet = forwardRef<AppSheetRef, AppSheetProps>(function AppSheet(props, ref) {
  const {
    snapPoints,
    enableDynamicSizing = false,
    stackBehavior,
    handleStyle,
    handleIndicatorStyle,
    enablePanDownToClose = true,
    enableContentPanningGesture,
    onDismiss,
    onChange,
    children,
    footer,
    backgroundRadius,
    backgroundColor,
    dismissOnBackdropPress = true,
    blurBackdrop = true,
    backdropOpacity,
    material = 'solid',
    blurTarget,
    bottomInset,
    topInset,
    style,
    detached,
    android_keyboardInputMode = 'adjustResize',
  } = resolveProps(props);
  // gorhom renders these as component *types*; an inline arrow is a new type every render and
  // remounts the whole background/backdrop subtree (Android blur re-setup, iOS GlassView rebuild).
  const backgroundComponent = useMemo(
    () =>
      material === 'glass'
        ? function AppSheetBackground(backgroundProps: BottomSheetBackgroundProps) {
            return (
              <GlassSheetBackground
                {...backgroundProps}
                cornerRadius={backgroundRadius ?? 48}
                blurTarget={blurTarget}
              />
            );
          }
        : undefined,
    [material, backgroundRadius, blurTarget],
  );
  const backdropComponent = useMemo(
    () =>
      function AppSheetBackdrop(backdropProps: BottomSheetBackdropProps) {
        return (
          <SheetBackdrop
            {...backdropProps}
            dismissOnPress={dismissOnBackdropPress}
            blur={blurBackdrop}
            dimOpacity={backdropOpacity}
          />
        );
      },
    [dismissOnBackdropPress, blurBackdrop, backdropOpacity],
  );
  return (
    <BottomSheetModal
      ref={ref}
      stackBehavior={stackBehavior}
      bottomInset={bottomInset}
      topInset={topInset}
      style={style}
      detached={detached}
      backgroundComponent={backgroundComponent}
      snapPoints={enableDynamicSizing ? undefined : (snapPoints ?? ['50%'])}
      enableDynamicSizing={enableDynamicSizing}
      enablePanDownToClose={enablePanDownToClose}
      enableContentPanningGesture={enableContentPanningGesture}
      onDismiss={onDismiss}
      onChange={onChange}
      // Sheets with text inputs (expense details) must ride above the keyboard, or the primary
      // button ends up hidden behind it. `restore` keeps the sheet where it was on blur.
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode={android_keyboardInputMode}
      backdropComponent={backdropComponent}
      footerComponent={
        footer
          ? (props: BottomSheetFooterProps) => (
              <BottomSheetFooter {...props}>{footer}</BottomSheetFooter>
            )
          : undefined
      }
      accessible={false}
      backgroundStyle={[
        styles.background,
        material === 'glass' && { backgroundColor: 'transparent' },
        backgroundColor ? { backgroundColor } : undefined,
        backgroundRadius != null && { borderRadius: backgroundRadius },
      ]}
      handleStyle={handleStyle}
      handleIndicatorStyle={[styles.handle, handleIndicatorStyle]}
    >
      {children}
    </BottomSheetModal>
  );
});

export interface DismissButtonProps {
  onPress: () => void;
  accessibilityLabel?: string;
}

/** Small circular close button for sheet headers. */
export function DismissButton({ onPress, accessibilityLabel = 'Close' }: DismissButtonProps) {
  return (
    <Button
      variant="toolbarIcon"
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      icon={<Ionicons name="close" size={20} color={colors.contentB} />}
      style={styles.dismiss}
    />
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'transparent' },
  background: { backgroundColor: colors.surface, borderRadius: radius.xxl },
  handle: { backgroundColor: colors.contentL, width: 40 },
  dismiss: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.neutral100 },
});
