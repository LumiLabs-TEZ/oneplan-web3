import { Ionicons } from '@expo/vector-icons';
import { type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { NOTE_ACTION_WIDTH, noteSwipeDestination } from '../helpers/noteSwipe';

export function SwipeToRemoveNote({
  children,
  onRemove,
  index,
}: {
  children: ReactNode;
  onRemove: () => boolean;
  index: number;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const offset = useSharedValue(0);
  const origin = useSharedValue(0);
  const width = useSharedValue(0);
  const removing = useSharedValue(false);
  const remove = () => {
    if (removing.get()) return;
    removing.set(true);
    offset.set(0);
    // Successful dispatch unmounts this row optimistically; rollback mounts a fresh row.
    if (!onRemove()) removing.set(false);
  };
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onStart(() => {
      origin.value = offset.value;
    })
    .onUpdate((event) => {
      offset.value = Math.min(0, Math.max(-width.value, origin.value + event.translationX));
    })
    .onEnd((event) => {
      const destination = noteSwipeDestination(offset.value, width.value, event.velocityX);
      if (destination === 'delete') runOnJS(remove)();
      else
        offset.value = withSpring(destination === 'reveal' ? -NOTE_ACTION_WIDTH : 0, {
          damping: 26,
          stiffness: 260,
        });
    })
    .onFinalize((_event, success) => {
      if (!success) offset.value = withSpring(0, { damping: 26, stiffness: 260 });
    });
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));
  const actionStyle = useAnimatedStyle(() => ({
    width: Math.max(NOTE_ACTION_WIDTH, -offset.value),
  }));
  return (
    <View
      style={styles.root}
      testID={`note-swipeable-${index}`}
      onLayout={(event) => {
        width.set(event.nativeEvent.layout.width);
      }}
    >
      <Animated.View style={[styles.action, actionStyle]}>
        <Pressable
          style={styles.button}
          onPress={remove}
          accessibilityRole="button"
          accessibilityLabel={t('Remove')}
          testID={`note-remove-${index}`}
        >
          <Ionicons name="trash-outline" size={20} color={colors.white} />
          <Text style={styles.label}>{t('Remove')}</Text>
        </Pressable>
      </Animated.View>
      <GestureDetector gesture={pan}>
        <Animated.View style={cardStyle}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden', borderRadius: 20 },
  action: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.secondary,
    borderRadius: 20,
  },
  button: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { ...beVietnamPro(12, 'medium'), color: colors.white },
});
