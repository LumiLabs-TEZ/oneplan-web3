import { onlineManager } from '@tanstack/react-query';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useDevOfflineStore } from '@/offline/devOffline';
import { Button } from '@/ui/components/Button';
import { colors, spacing } from '@/ui/theme';

/**
 * Dev-only switch that forces TanStack's `onlineManager` offline so Maestro can exercise the
 * `requireOnline` write guards on the simulator. Excluded from prod by the `(dev)` stack guard.
 * Open with `dev.lumilabs.oneplan:///offline`.
 */
export default function DevOfflineScreen() {
  const forced = useDevOfflineStore((s) => s.forced);
  const setForced = useDevOfflineStore((s) => s.setForced);
  return (
    <SafeAreaView style={styles.screen} testID="dev-offline-screen">
      <View style={styles.content}>
        <Text style={styles.title}>Dev offline switch</Text>
        <Text style={styles.status}>
          forced: {String(forced)} · onlineManager: {String(onlineManager.isOnline())}
        </Text>
        <Button title="Force offline" testID="dev-offline-on" onPress={() => setForced(true)} />
        <Button
          title="Back online"
          variant="secondary"
          testID="dev-offline-off"
          onPress={() => setForced(false)}
        />
        <Button
          title="Back"
          variant="secondary"
          testID="dev-offline-back"
          onPress={() => router.back()}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.white },
  content: { padding: spacing.lg, gap: spacing.md },
  title: { fontSize: 20, fontWeight: '600', color: colors.contentB },
  status: { color: colors.contentB },
});
