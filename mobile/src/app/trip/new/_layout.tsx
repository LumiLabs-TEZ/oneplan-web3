/** "New trip" flow route group — pushed from the Trip tab, like `CreateTripView.swift`. */
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';

import { colors } from '@/ui/theme';

export default function NewTripLayout() {
  return (
    // Own provider: the root one's portal host sits BELOW this pushed native stack, so a sheet
    // presented from `index` (the duration picker) would render behind it and be invisible.
    // Nesting a provider puts the host inside the stack, where it belongs.
    <BottomSheetModalProvider>
      <Stack
        screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="friends" />
        {/* iOS presents the picker as a `.fullScreenCover` (`CreateTripView.swift:285`). */}
        <Stack.Screen name="location" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
    </BottomSheetModalProvider>
  );
}
