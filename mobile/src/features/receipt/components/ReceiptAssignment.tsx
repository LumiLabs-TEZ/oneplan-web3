import { ReceiptIcon } from '@/features/receipt/components/ReceiptIcon';
import * as Haptics from 'expo-haptics';
import { useFonts, type FontSource } from 'expo-font';
import { useReducer, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type LayoutRectangle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  measure,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
  type AnimatedRef,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { svg } from '@/ui/assets';
import { CachedImage, MoneyText } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import {
  assignmentReducer,
  memberTotal,
  RECEIPT_NAME_MAX_LENGTH,
  type AssignmentState,
  type ReceiptItem,
  type ReceiptMember,
} from '../assignment';
import { ReceiptChip, receiptNumberFont } from './ReceiptChip';
import { UndoReset, pillStyles } from './UndoReset';

const receiptFonts: Record<string, FontSource> =
  Platform.OS === 'ios'
    ? { 'SF Compact Rounded': { uri: 'file:///System/Library/Fonts/Core/SFCompactRounded.ttf' } }
    : {};
const spring = { duration: 400, dampingRatio: 0.8 };
const lightHaptic = () => {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
};
type Rect = LayoutRectangle;
const SPLIT_ZONE_MIN_WIDTH = 180;
interface DragContext {
  root: AnimatedRef<View>;
  frames: SharedValue<Record<string, Rect>>;
  scrollY: SharedValue<number>;
  active: SharedValue<string>;
  hovered: SharedValue<string>;
  x: SharedValue<number>;
  y: SharedValue<number>;
  cluster: SharedValue<number>;
  splitVisibility: SharedValue<number>;
  gridOffsetX: number;
  zone: Rect;
  selected: string[];
  split: boolean;
}
function contains(rect: Rect, x: number, y: number) {
  'worklet';
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}
function ReceiptAvatar({ member }: { member: ReceiptMember }) {
  const Placeholder = svg.avatarPlaceholder;
  return (
    <View style={styles.avatar}>
      <Placeholder width={107} height={107} />
      <CachedImage uri={member.imageURL} style={StyleSheet.absoluteFill} transition={0} />
    </View>
  );
}
function Member({
  member,
  drag,
  total,
  currency,
  onSelect,
  onLayout,
}: {
  member: ReceiptMember;
  drag: DragContext;
  total?: number;
  currency: Currency;
  onSelect: () => void;
  onLayout: (frame: Rect) => void;
}) {
  const selected = drag.selected.includes(member.id);
  const frameStyle = useAnimatedStyle(() => ({
    opacity: 1 - drag.splitVisibility.value * (selected ? 1 : 0.5),
  }));
  const avatarStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: withSpring(drag.hovered.value === member.id ? 1.1 : 1, {
          duration: 250,
          dampingRatio: 0.8,
        }),
      },
    ],
  }));
  const hoverStyle = useAnimatedStyle(() => ({
    opacity: drag.hovered.value === member.id ? 1 : 0,
  }));
  return (
    <Animated.View
      style={[styles.member, frameStyle]}
      onLayout={(event) => onLayout(event.nativeEvent.layout)}
    >
      <Pressable
        onPress={onSelect}
        accessibilityRole={drag.split ? 'checkbox' : undefined}
        accessibilityState={drag.split ? { checked: selected } : undefined}
        accessibilityLabel={member.name}
        style={styles.memberPress}
      >
        <Animated.View style={avatarStyle}>
          <ReceiptAvatar member={member} />
          <Animated.View pointerEvents="none" style={[styles.hover, hoverStyle]} />
          {drag.split ? (
            <View style={[styles.checkbox, selected && styles.checked]}>
              {selected ? <ReceiptIcon name="confirm" size={10} color={colors.white} /> : null}
            </View>
          ) : null}
          {total !== undefined ? (
            <View style={styles.amountBadge}>
              <MoneyText
                amount={total / 10 ** currency.decimalPlaces}
                currency={currency}
                style={styles.amount}
              />
            </View>
          ) : null}
        </Animated.View>
        <Text style={styles.memberName} numberOfLines={1}>
          {member.name}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
function DraggableChip({
  item,
  currency,
  remaining,
  drag,
  onDrop,
}: {
  item: ReceiptItem;
  currency: Currency;
  remaining: number;
  drag: DragContext;
  onDrop: (itemId: string, memberIds: string[]) => void;
}) {
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const update = (absoluteX: number, absoluteY: number) => {
    'worklet';
    const x = absoluteX - originX.value;
    const y = absoluteY - originY.value;
    drag.x.set(x);
    drag.y.set(y);
    if (drag.split && drag.selected.length)
      drag.hovered.set(contains(drag.zone, x, y) ? 'split' : '');
    else {
      drag.hovered.set('');
      for (const id of Object.keys(drag.frames.value)) {
        const frame = drag.frames.value[id]!;
        if (
          contains(
            { ...frame, x: frame.x + drag.gridOffsetX, y: frame.y - drag.scrollY.value },
            x,
            y,
          )
        ) {
          drag.hovered.set(id);
          break;
        }
      }
    }
  };
  const gesture = Gesture.Pan()
    .minDistance(5)
    .enabled(remaining > 0)
    .onStart((event) => {
      const root = measure(drag.root);
      if (!root) return;
      originX.value = root.pageX;
      originY.value = root.pageY;
      drag.active.set(item.id);
      cancelAnimation(drag.splitVisibility);
      cancelAnimation(drag.cluster);
      if (drag.split && drag.selected.length) {
        drag.splitVisibility.set(1);
        drag.cluster.set(withSpring(1, spring));
      }
      update(event.absoluteX, event.absoluteY);
      scheduleOnRN(lightHaptic);
    })
    .onUpdate((event) => {
      if (drag.active.value === item.id) update(event.absoluteX, event.absoluteY);
    })
    .onEnd((event) => {
      if (drag.active.value !== item.id) return;
      update(event.absoluteX, event.absoluteY);
      const target = drag.hovered.value;
      if (target) scheduleOnRN(onDrop, item.id, target === 'split' ? drag.selected : [target]);
    })
    .onFinalize(() => {
      if (drag.active.value !== item.id) return;
      drag.active.set('');
      drag.hovered.set('');
      drag.cluster.set(
        withSpring(0, spring, (finished) => {
          if (finished) drag.splitVisibility.set(withTiming(0, { duration: 200 }));
        }),
      );
    });
  const style = useAnimatedStyle(() => ({
    opacity: withTiming(remaining <= 0 || drag.active.value === item.id ? 0.3 : 1, {
      duration: 200,
    }),
  }));
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.chipSlot, style]} testID={`receipt-item-${item.id}`}>
        <ReceiptChip item={item} currency={currency} remaining={remaining} />
      </Animated.View>
    </GestureDetector>
  );
}
function DraggedChip({
  item,
  currency,
  drag,
}: {
  item: ReceiptItem;
  currency: Currency;
  drag: DragContext;
}) {
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const style = useAnimatedStyle(() => ({
    opacity: drag.active.value === item.id ? 1 : 0,
    transform: [
      { translateX: drag.x.value - width.value / 2 },
      { translateY: drag.y.value - height.value / 2 },
      { scale: 1.05 },
    ],
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.draggedChip, style]}
      onLayout={(event) => {
        width.value = event.nativeEvent.layout.width;
        height.value = event.nativeEvent.layout.height;
      }}
    >
      <ReceiptChip item={item} currency={currency} />
    </Animated.View>
  );
}
function ClusterAvatar({
  member,
  index,
  drag,
}: {
  member: ReceiptMember;
  index: number;
  drag: DragContext;
}) {
  const style = useAnimatedStyle(() => {
    const frame = drag.frames.value[member.id];
    const gridX = frame ? frame.x + drag.gridOffsetX + frame.width / 2 : drag.zone.x;
    const gridY = frame ? frame.y - drag.scrollY.value + frame.height / 2 : drag.zone.y;
    // Avatars stay centred in the zone, which may be wider than the stack (min width for the label).
    const centerX =
      drag.zone.x + drag.zone.width / 2 + (index - (drag.selected.length - 1) / 2) * 35;
    const centerY = drag.zone.y + 30 + 25;
    const p = drag.cluster.value;
    return {
      opacity: drag.splitVisibility.value,
      transform: [
        { translateX: gridX + (centerX - gridX) * p - 53.5 },
        { translateY: gridY + (centerY - gridY) * p - 53.5 },
        { scale: 1 - p * (1 - 50 / 107) },
      ],
    };
  });
  return (
    <Animated.View style={[styles.clusterAvatar, style]}>
      <ReceiptAvatar member={member} />
      <View style={styles.clusterBorder} />
    </Animated.View>
  );
}
function SplitZone({ drag }: { drag: DragContext }) {
  useAppLanguage();
  const { t } = useTranslation();
  const style = useAnimatedStyle(() => ({
    opacity: drag.splitVisibility.value * drag.cluster.value,
    borderColor: drag.hovered.value === 'split' ? colors.blueBase : colors.contentL,
    transform: [
      {
        scale: withSpring(drag.hovered.value === 'split' ? 1.05 : 1, {
          duration: 250,
          dampingRatio: 0.8,
        }),
      },
    ],
  }));
  return (
    <Animated.View
      style={[
        styles.zone,
        { left: drag.zone.x, top: drag.zone.y, width: drag.zone.width, height: drag.zone.height },
        style,
      ]}
    >
      <Text style={styles.zoneText} numberOfLines={1}>
        {t('Drop to split evenly')}
      </Text>
    </Animated.View>
  );
}

export function ReceiptAssignment({
  initialState,
  currency,
  restaurantName,
  onNameChange,
  onBack,
  onConfirm,
}: {
  initialState: AssignmentState;
  currency: Currency;
  restaurantName: string;
  onNameChange: (name: string) => void;
  onBack: () => void;
  onConfirm: (state: AssignmentState) => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const [fontsLoaded, fontError] = useFonts(receiptFonts);
  const [state, dispatch] = useReducer(assignmentReducer, initialState);
  const [split, setSplit] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [cardHeight, setCardHeight] = useState(0);
  const root = useAnimatedRef<View>();
  const frames = useSharedValue<Record<string, Rect>>({});
  const measuredFrames = useRef<Record<string, Rect>>({});
  const scrollY = useSharedValue(0);
  const active = useSharedValue('');
  const hovered = useSharedValue('');
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const cluster = useSharedValue(0);
  const splitVisibility = useSharedValue(0);
  const selectedMembers = state.members.filter((m) => selected.includes(m.id));
  // Wide enough to keep "Drop to split evenly" on one centred line, even for a single avatar.
  const zoneWidth = Math.max(50 + 35 * Math.max(0, selected.length - 1) + 60, SPLIT_ZONE_MIN_WIDTH);
  const zone = {
    x: (size.width - zoneWidth) / 2,
    y: (size.height - cardHeight) / 2 - 55,
    width: zoneWidth,
    height: 140,
  };
  const drag: DragContext = {
    root,
    frames,
    scrollY,
    active,
    hovered,
    x,
    y,
    cluster,
    splitVisibility,
    gridOffsetX: (size.width - 351) / 2,
    zone,
    selected,
    split,
  };
  const scroll = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });
  const drop = (itemId: string, memberIds: string[]) => {
    dispatch({ type: 'assign', itemId, memberIds });
    if (split && selected.length)
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };
  const rows = Array.from({ length: Math.ceil(state.items.length / 2) }, (_, i) =>
    state.items.slice(i * 2, i * 2 + 2),
  );
  if (!fontsLoaded && !fontError) return <View style={styles.screen} />;
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            Keyboard.dismiss();
            onBack();
          }}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
          style={styles.headerButton}
        >
          <View style={styles.circleSurface}>
            <ReceiptIcon name="back" size={14} color={colors.contentB} />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>{t('Members')}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Confirm')}
          disabled={!state.history.length}
          onPress={() => {
            lightHaptic();
            Keyboard.dismiss();
            onConfirm(state);
          }}
          style={styles.headerButton}
        >
          {/* Circle stays solid while disabled; only the glyph dims (iOS 26 toolbar behavior). */}
          <View style={styles.circleSurface}>
            <View style={!state.history.length && styles.dimmed}>
              <ReceiptIcon name="confirm" size={12} color={colors.blueBase} />
            </View>
          </View>
        </Pressable>
      </View>
      <Animated.View
        ref={root}
        style={styles.container}
        onLayout={(event) => setSize(event.nativeEvent.layout)}
      >
        <Animated.ScrollView
          onScroll={scroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: cardHeight + 8, paddingTop: 8 }}
        >
          <View style={styles.grid}>
            {state.members.map((member) => (
              <Member
                key={member.id}
                member={member}
                currency={currency}
                total={memberTotal(state, member.id)}
                drag={drag}
                onSelect={() => {
                  if (split)
                    setSelected((ids) =>
                      ids.includes(member.id)
                        ? ids.filter((id) => id !== member.id)
                        : [...ids, member.id],
                    );
                }}
                onLayout={(frame) => {
                  // Layout events may arrive in one JS batch before shared-value writes reach the UI thread.
                  measuredFrames.current[member.id] = { ...frame, y: frame.y + 8 };
                  frames.value = { ...measuredFrames.current };
                }}
              />
            ))}
          </View>
        </Animated.ScrollView>
        <View
          style={styles.card}
          onLayout={(event) => setCardHeight(event.nativeEvent.layout.height)}
        >
          <View style={styles.cardHeader}>
            <TextInput
              accessibilityLabel={t('Restaurant name')}
              placeholder={t('Restaurant name')}
              value={restaurantName}
              onChangeText={onNameChange}
              maxLength={RECEIPT_NAME_MAX_LENGTH}
              style={styles.title}
              returnKeyType="done"
            />
            <UndoReset
              hasHistory={state.history.length > 0}
              onUndo={() => dispatch({ type: 'undo' })}
              onReset={() => dispatch({ type: 'reset' })}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: split }}
              onPress={() => {
                lightHaptic();
                setSplit(!split);
                setSelected([]);
              }}
              style={[pillStyles.pill, split && pillStyles.active]}
            >
              <Text style={[pillStyles.text, split && pillStyles.activeText]}>{t('Split')}</Text>
            </Pressable>
          </View>
          <View style={styles.items}>
            {rows.map((row, index) => (
              <View key={index} style={styles.row}>
                {row.map((item) => (
                  <DraggableChip
                    key={item.id}
                    item={item}
                    remaining={state.remaining[item.id] ?? 0}
                    currency={currency}
                    drag={drag}
                    onDrop={drop}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <SplitZone drag={drag} />
          {selectedMembers.map((member, index) => (
            <ClusterAvatar key={member.id} member={member} index={index} drag={drag} />
          ))}
          {state.items.map((item) => (
            <DraggedChip key={item.id} item={item} currency={currency} drag={drag} />
          ))}
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  header: {
    height: 54,
    paddingBottom: 10,
    paddingHorizontal: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.4 },
  circleSurface: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
    backgroundColor: '#FFFFFFE6',
    boxShadow: '0px 8px 28px rgba(0,0,0,0.06)',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 11,
    textAlign: 'center',
    pointerEvents: 'none',
    fontSize: 17,
    fontWeight: '600',
    color: '#000000',
  },
  grid: {
    width: 351,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    columnGap: 15,
    rowGap: 28,
  },
  member: { width: 107 },
  memberPress: { alignItems: 'center', gap: 5.585 },
  avatar: {
    width: 107,
    height: 107,
    borderRadius: 33.513,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  memberName: { ...beVietnamPro(15), color: colors.contentM, width: 58.089, textAlign: 'center' },
  hover: {
    ...StyleSheet.absoluteFill,
    borderRadius: 54,
    borderWidth: 2.5,
    borderColor: colors.blueBase,
  },
  checkbox: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.contentL,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checked: { borderColor: colors.blueBase, backgroundColor: colors.blueBase },
  amountBadge: {
    position: 'absolute',
    left: 25,
    top: -8,
    borderRadius: 100,
    backgroundColor: colors.blueBase,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  amount: { ...receiptNumberFont, fontSize: 12, color: colors.white, letterSpacing: -0.6 },
  card: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 0,
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 4,
    backgroundColor: colors.surface,
    borderRadius: 18,
    borderCurve: 'continuous',
    gap: 8,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  title: {
    ...beVietnamPro(14),
    color: colors.contentB,
    letterSpacing: -0.6,
    flex: 1,
    minWidth: 0,
    padding: 0,
  },
  items: { padding: 4, gap: 4 },
  row: { flexDirection: 'row', gap: 4 },
  chipSlot: { flex: 1, alignItems: 'flex-start' },
  draggedChip: {
    position: 'absolute',
    left: 0,
    top: 0,
    boxShadow: '0px 4px 16px rgba(0,0,0,0.15)',
  },
  clusterAvatar: { position: 'absolute', left: 0, top: 0 },
  clusterBorder: {
    ...StyleSheet.absoluteFill,
    borderRadius: 54,
    borderWidth: 3,
    borderColor: colors.surface,
  },
  zone: {
    position: 'absolute',
    backgroundColor: '#FFFFFFE6',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    paddingHorizontal: 12,
  },
  zoneText: {
    ...beVietnamPro(14),
    letterSpacing: -0.6,
    color: colors.contentM,
    textAlign: 'center',
  },
});
