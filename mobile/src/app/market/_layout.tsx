import { Stack } from 'expo-router';
export default function MarketLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* Always full-screen, like the trip plan's location (`trip/[tripId]/_layout.tsx`) and iOS `.fullScreenCover`. */}
      <Stack.Screen name="location" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
