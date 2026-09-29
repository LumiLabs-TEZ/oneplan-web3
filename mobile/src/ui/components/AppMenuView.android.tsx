/**
 * Android menu popover mirroring the iOS 26 SwiftUI `Menu`: a rounded white card anchored to the
 * trigger, a leading checkmark column for `state` rows, optional leading icons, hairline dividers
 * between `displayInline` groups and red destructive rows. Replaces the Material PopupMenu that
 * `@react-native-menu/menu` renders on Android; iOS keeps the native UIMenu (`AppMenuView.tsx`).
 */
import { Ionicons } from '@expo/vector-icons';
import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type LayoutChangeEvent,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { AppMenuAction, AppMenuViewProps } from './AppMenuView';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export type { AppMenuAction, AppMenuViewProps } from './AppMenuView';

const DESTRUCTIVE = '#FF3B30';
const MIN_WIDTH = 250;
const EDGE_MARGIN = 12;
/** Gap between the trigger and the card. */
const ANCHOR_GAP = 6;
const OPEN_MS = 180;
const CLOSE_MS = 120;

interface Anchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Inline groups become sections split by dividers; anything else is one section. */
export function menuSections(actions: readonly AppMenuAction[]): AppMenuAction[][] {
  const sections: AppMenuAction[][] = [];
  let loose: AppMenuAction[] = [];
  for (const action of actions) {
    if (action.displayInline && action.subactions) {
      if (loose.length) sections.push(loose);
      loose = [];
      if (action.subactions.length) sections.push(action.subactions);
    } else {
      loose.push(action);
    }
  }
  if (loose.length) sections.push(loose);
  return sections;
}

/**
 * Card origin: below the trigger, left-aligned; flips above when it would overflow the bottom and
 * right-aligns to the trigger when it would overflow the right edge. Always clamped to the insets.
 */
export function menuPlacement(
  anchor: Anchor,
  card: { width: number; height: number },
  screen: { width: number; height: number; top: number; bottom: number },
): { left: number; top: number; fromTop: boolean; fromLeft: boolean } {
  const minTop = screen.top + EDGE_MARGIN;
  const maxBottom = screen.height - screen.bottom - EDGE_MARGIN;

  let top = anchor.y + anchor.height + ANCHOR_GAP;
  let fromTop = true;
  if (top + card.height > maxBottom) {
    const above = anchor.y - ANCHOR_GAP - card.height;
    if (above >= minTop) {
      top = above;
      fromTop = false;
    } else {
      top = Math.max(minTop, maxBottom - card.height);
    }
  }

  let left = anchor.x;
  let fromLeft = true;
  if (left + card.width > screen.width - EDGE_MARGIN) {
    left = anchor.x + anchor.width - card.width;
    fromLeft = false;
  }
  left = Math.min(Math.max(left, EDGE_MARGIN), screen.width - EDGE_MARGIN - card.width);
  return { left, top, fromTop, fromLeft };
}

export function AppMenuView({ actions, onPressAction, testID, style, children }: AppMenuViewProps) {
  const triggerRef = useRef<View>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [cardSize, setCardSize] = useState<{ width: number; height: number } | null>(null);
  const closing = useRef(false);
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  const open = useCallback(() => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      closing.current = false;
      setCardSize(null);
      setAnchor({ x, y, width, height });
    });
  }, []);

  const close = useCallback(
    (picked?: string) => {
      if (closing.current) return;
      closing.current = true;
      progress.set(withTiming(0, { duration: CLOSE_MS }));
      // Fire after the modal is gone so a follow-on sheet / alert doesn't stack on it.
      setTimeout(() => {
        setAnchor(null);
        if (picked !== undefined) onPressAction?.({ nativeEvent: { event: picked } });
      }, CLOSE_MS);
    },
    [onPressAction, progress],
  );

  const placed = anchor && cardSize;
  useEffect(() => {
    if (placed) progress.set(withTiming(1, { duration: OPEN_MS }));
    else progress.set(0);
  }, [placed, progress]);

  const width = Math.min(Math.max(anchor?.width ?? 0, MIN_WIDTH), window.width - EDGE_MARGIN * 2);
  const placement =
    anchor && cardSize
      ? menuPlacement(anchor, cardSize, {
          width: window.width,
          height: window.height,
          top: insets.top,
          bottom: insets.bottom,
        })
      : null;

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ scale: 0.9 + 0.1 * progress.get() }],
  }));

  const sections = menuSections(actions);
  const all = sections.flat();
  const hasState = all.some((a) => a.state !== undefined);
  const hasIcon = all.some((a) => a.androidIcon !== undefined);

  return (
    <>
      <Pressable
        ref={triggerRef}
        onPress={open}
        testID={testID}
        style={style}
        accessibilityRole="button"
        collapsable={false}
      >
        {children}
      </Pressable>
      <Modal
        visible={anchor !== null}
        transparent
        statusBarTranslucent
        navigationBarTranslucent
        animationType="none"
        onRequestClose={() => close()}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => close()}
          testID={testID ? `${testID}-backdrop` : undefined}
        />
        <Animated.View
          onLayout={(e: LayoutChangeEvent) => {
            const { width: w, height: h } = e.nativeEvent.layout;
            if (!cardSize || cardSize.width !== w || cardSize.height !== h) {
              setCardSize({ width: w, height: h });
            }
          }}
          style={[
            styles.card,
            { width },
            placement
              ? {
                  left: placement.left,
                  top: placement.top,
                  transformOrigin: `${placement.fromLeft ? 'left' : 'right'} ${
                    placement.fromTop ? 'top' : 'bottom'
                  }`,
                }
              : styles.measuring,
            animatedStyle,
          ]}
          accessibilityRole="menu"
        >
          {sections.map((section, sectionIndex) => (
            <Fragment key={section[0]?.id ?? sectionIndex}>
              {sectionIndex > 0 ? <View style={styles.divider} /> : null}
              {section.map((action) => (
                <MenuRow
                  key={action.id ?? action.title}
                  action={action}
                  hasState={hasState}
                  hasIcon={hasIcon}
                  testID={testID ? `${testID}-item-${action.id}` : undefined}
                  onPress={() => close(action.id)}
                />
              ))}
            </Fragment>
          ))}
        </Animated.View>
      </Modal>
    </>
  );
}

function MenuRow({
  action,
  hasState,
  hasIcon,
  testID,
  onPress,
}: {
  action: AppMenuAction;
  hasState: boolean;
  hasIcon: boolean;
  testID?: string;
  onPress: () => void;
}) {
  const destructive = action.attributes?.destructive === true;
  const disabled = action.attributes?.disabled === true;
  const color = destructive ? DESTRUCTIVE : colors.contentB;
  const checked = action.state === 'on';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      accessibilityRole="menuitem"
      accessibilityState={{ disabled, checked: hasState ? checked : undefined }}
      style={({ pressed }) => [
        styles.row,
        pressed && styles.rowPressed,
        disabled && styles.disabled,
      ]}
    >
      {hasState ? (
        <View style={styles.leading}>
          {checked ? <Ionicons name="checkmark" size={20} color={color} /> : null}
        </View>
      ) : null}
      {hasIcon ? (
        <View style={styles.leading}>
          {action.androidIcon ? (
            <Ionicons name={action.androidIcon} size={20} color={color} />
          ) : null}
        </View>
      ) : null}
      <Text style={[styles.title, { color }]}>{action.title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    paddingVertical: 8,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.98)',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  /** First layout pass: measured off-screen, invisible, before the card is placed. */
  measuring: { left: 0, top: 0, opacity: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  rowPressed: { backgroundColor: 'rgba(0,0,0,0.06)' },
  disabled: { opacity: 0.4 },
  leading: { width: 22, alignItems: 'center' },
  title: { ...beVietnamPro(17), flexShrink: 1 },
  divider: {
    height: StyleSheet.hairlineWidth * 2,
    marginVertical: 6,
    marginHorizontal: 18,
    backgroundColor: colors.neutral100,
  },
});
