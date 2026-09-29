/**
 * 58pt glass `+` button (`MainView.swift:172-190`): light impact haptic, icon rotates 45°
 * when expanded with the same `.bouncy(0.5, extraBounce 0.05)` spring as the bar morph.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { GlassSurface } from '@/ui/components/GlassSurface';
import { colors } from '@/ui/theme';

import { MORPH_SPRING } from '../morph';

const SIZE = 58;

export function Fab({ expanded, onPress }: { expanded: boolean; onPress: () => void }) {
  const rotation = useSharedValue(0);
  useEffect(() => {
    rotation.set(withSpring(expanded ? 45 : 0, MORPH_SPRING));
  }, [expanded, rotation]);
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${rotation.value}deg` }] }));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Quick actions"
      accessibilityState={{ expanded }}
      testID="fab"
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <GlassSurface preset="control" radius={SIZE / 2} style={styles.fab}>
        <Animated.View style={style}>
          <Ionicons name="add" size={30} color={colors.contentB} />
        </Animated.View>
      </GlassSurface>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
});
