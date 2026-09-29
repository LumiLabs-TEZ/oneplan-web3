/** Trip-invite deep-link route group — presented as a full-screen modal; the drag-to-join
 * screen owns its own dismiss button, so the swipe-back gesture is disabled. */
import { Stack } from 'expo-router';

import { colors } from '@/ui/theme';

export default function JoinLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="[code]" />
    </Stack>
  );
}
