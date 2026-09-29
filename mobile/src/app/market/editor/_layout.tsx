import { Stack } from 'expo-router';
export default function EditorLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      {/* iOS presents the place picker as a `.fullScreenCover` (`CreateMarketPlanView.swift`). */}
      <Stack.Screen name="location" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}
