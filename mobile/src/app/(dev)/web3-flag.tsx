import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useWeb3Enabled, useWeb3FlagStore } from '@/features/vault/web3Flag';
import { Button } from '@/ui/components/Button';
import { colors, spacing } from '@/ui/theme';

/**
 * Dev-only override for the web3 vault/wallet feature flag (`useWeb3Enabled`). Prod always
 * resolves OFF regardless of what is persisted here — see `resolveWeb3Enabled`.
 * Open with `dev.lumilabs.oneplan:///web3-flag`.
 */
export default function DevWeb3FlagScreen() {
  const override = useWeb3FlagStore((s) => s.override);
  const setOverride = useWeb3FlagStore((s) => s.setOverride);
  const enabled = useWeb3Enabled();
  return (
    <SafeAreaView style={styles.screen} testID="dev-web3-flag-screen">
      <View style={styles.content}>
        <Text style={styles.title}>Web3 vault flag</Text>
        <Text style={styles.status}>
          override: {String(override)} · resolved: {String(enabled)}
        </Text>
        <Button title="Force ON" testID="dev-web3-flag-on" onPress={() => setOverride(true)} />
        <Button
          title="Force OFF"
          variant="secondary"
          testID="dev-web3-flag-off"
          onPress={() => setOverride(false)}
        />
        <Button
          title="Clear override"
          variant="secondary"
          testID="dev-web3-flag-clear"
          onPress={() => setOverride(null)}
        />
        <Button
          title="Back"
          variant="secondary"
          testID="dev-web3-flag-back"
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
