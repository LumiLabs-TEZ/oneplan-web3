import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useAppLanguage, setAppLanguage } from '@/i18n';
import { Button } from '@/ui/components/Button';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { ContributeToVaultSheet } from '@/features/vault/screens/ContributeToVaultSheet';
import { DepositOptionsSheet } from '@/features/vault/screens/DepositOptionsSheet';
import { DepositToOnePlanWalletSheet } from '@/features/vault/screens/DepositToOnePlanWalletSheet';
import { HowMoneyIsHeldSheet } from '@/features/vault/screens/HowMoneyIsHeldSheet';
import { TripVaultSection } from '@/features/vault/screens/TripVaultSection';
import { VaultDepositingSheet } from '@/features/vault/screens/VaultDepositingSheet';
import { VaultDepositResultScreen } from '@/features/vault/screens/VaultDepositResultScreen';
import { WelcomeTripWalletSheet } from '@/features/vault/screens/WelcomeTripWalletSheet';

/**
 * Fixture gallery for every Wave A screen — renders each one for manual/screenshot verification
 * against the Swift originals (`ios/OnePlan/OnePlan/View/{Wallet,Vault}/*.swift`,
 * `feat/web3-version`) without needing a live Privy app or a trip with an on-chain vault.
 * Dev-only, same `!isProd` guard as `(dev)/vault-kit`. Open with
 * `dev.lumilabs.oneplan:///web3-wave-a`.
 *
 * Screens that call live queries internally (Contribute, DepositToOnePlanWallet, Welcome,
 * TripVaultSection) render their real loading/empty states against this build's dev API — there
 * is no fixture-mode override at the hook level, so what you see here is exactly what a real
 * device without a linked wallet shows.
 */
const SCREENS = [
  'deposit-options',
  'how-money-is-held',
  'contribute',
  'depositing',
  'deposit-result-processing',
  'deposit-result-completed',
  'deposit-to-wallet',
  'welcome',
  'trip-vault-section',
] as const;
type ScreenKey = (typeof SCREENS)[number];

export default function DevWeb3WaveAScreen() {
  const language = useAppLanguage();
  const [active, setActive] = useState<ScreenKey | null>(null);

  if (active) {
    return (
      <SafeAreaProvider>
        <View style={styles.screen} testID={`dev-web3-wave-a-${active}`}>
          <Button
            title="Back to gallery"
            variant="secondary"
            style={styles.backButton}
            onPress={() => setActive(null)}
          />
          {renderScreen(active)}
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <View style={styles.screen} testID="dev-web3-wave-a-gallery">
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Web3 Wave A screens</Text>
        <View style={styles.langRow}>
          <Button
            title="EN"
            variant={language === 'en' ? 'primary' : 'secondary'}
            testID="dev-web3-wave-a-lang-en"
            onPress={() => setAppLanguage('en')}
          />
          <Button
            title="VI"
            variant={language === 'vi' ? 'primary' : 'secondary'}
            testID="dev-web3-wave-a-lang-vi"
            onPress={() => setAppLanguage('vi')}
          />
          <Button title="Back" variant="secondary" onPress={() => router.back()} />
        </View>

        {SCREENS.map((key) => (
          <Button
            key={key}
            title={key}
            variant="secondary"
            testID={`dev-web3-wave-a-open-${key}`}
            style={styles.entryButton}
            onPress={() => setActive(key)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function renderScreen(key: ScreenKey) {
  switch (key) {
    case 'deposit-options':
      return <DepositOptionsSheet onOnchain={() => undefined} />;
    case 'how-money-is-held':
      return <HowMoneyIsHeldSheet onClose={() => undefined} />;
    case 'contribute':
      return <ContributeToVaultSheet tripId={1} onContribute={() => undefined} />;
    case 'depositing':
      return (
        <VaultDepositingSheet
          amountMicro={5_000_000n}
          fromAddress="9RqQabcdefghijklmnopDzQi"
          toAddress="6yTjabcdefghijklmnopoeRkh"
          onDetails={() => undefined}
        />
      );
    case 'deposit-result-processing':
      return (
        <VaultDepositResultScreen
          flow={{
            amountMicro: 5_000_000n,
            recipient: '9RqQabcdefghijklmnopDzQi',
            status: 'processing',
            signature: '',
            date: Date.now(),
          }}
          onDone={() => undefined}
        />
      );
    case 'deposit-result-completed':
      return (
        <VaultDepositResultScreen
          flow={{
            amountMicro: 5_000_000n,
            recipient: '9RqQabcdefghijklmnopDzQi',
            status: 'completed',
            signature: 'h42fjh24abcdefghijklmnop',
            date: Date.now(),
          }}
          onDone={() => undefined}
        />
      );
    case 'deposit-to-wallet':
      return <DepositToOnePlanWalletSheet onBack={() => undefined} />;
    case 'welcome':
      return <WelcomeTripWalletSheet onContinue={() => undefined} onClose={() => undefined} />;
    case 'trip-vault-section':
      return (
        <ScrollView>
          <TripVaultSection
            tripId={1}
            tripName="Dubai 2025"
            balanceInHomeCurrency={4_500_000}
            homeCurrency="VND"
          />
        </ScrollView>
      );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.sm },
  title: { ...beVietnamPro(22, 'semibold'), color: colors.contentB, marginBottom: spacing.sm },
  langRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  entryButton: { marginBottom: spacing.xs },
  backButton: { position: 'absolute', top: 48, left: 16, zIndex: 10 },
});
