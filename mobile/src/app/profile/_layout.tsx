/** Profile route group — pushed from the header avatar (`AppHeader`), port of `ProfileView`'s
 * `.navigationDestination` pushes (invite / settings / passport / friends). */
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Stack } from 'expo-router';

import { useWeb3Enabled } from '@/features/vault/web3Flag';
import { colors } from '@/ui/theme';

export default function ProfileLayout() {
  const web3Enabled = useWeb3Enabled();
  return (
    // Own provider — same reasoning as `trip/new/_layout.tsx`: a sheet presented from a screen
    // inside this pushed stack needs its portal host nested inside the stack, not the root.
    <BottomSheetModalProvider>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="invite" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="passport" />
        {/* Web3 only: absent with the flag off, so `oneplan://profile/wallet` cannot open it. */}
        <Stack.Protected guard={web3Enabled}>
          <Stack.Screen name="wallet" />
        </Stack.Protected>
        <Stack.Screen name="friends/index" />
      </Stack>
    </BottomSheetModalProvider>
  );
}
