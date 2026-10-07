/**
 * Android only (MWA backend): the member brings their own Solana wallet. One tap opens the
 * wallet, which shows a Sign-In-With-Solana prompt; approving it proves ownership to the server
 * and links the key. Once connected it shows the `.skr` name / short address, the Seeker badge
 * and Disconnect (local only — the server link stays). Renders nothing on iOS/Privy.
 */
import type { TFunction } from 'i18next';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiMutationError, mutationErrorMessage } from '@/api/mutationError';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { shortenAddress } from '../shortenAddress';
import { WalletError, walletErrorMessageKey } from '../wallet/walletError';
import {
  connectVaultWallet,
  connectedVaultWalletAddress,
  resetVaultWallet,
  subscribeWalletHandle,
  vaultWalletKind,
} from '../wallet/walletHandle';
import { NoWalletAppSheet } from './NoWalletAppSheet';
import { SeekerIdentityTag } from './SeekerIdentityTag';

export interface ConnectWalletCardProps {
  onConnected?: (address: string) => void;
  onDisconnected?: () => void;
  /** From `GET /wallet` when the parent has it; display only. */
  skrDomain?: string | null;
  isSeeker?: boolean;
}

/** null = say nothing (the member cancelled in their wallet). */
function connectErrorMessage(t: TFunction, error: unknown): string | null {
  if (error instanceof WalletError) {
    if (error.kind === 'cancelled') return null;
    return t(walletErrorMessageKey(error), { 0: error.reason ?? '' });
  }
  if (error instanceof ApiMutationError && error.status === 409) {
    const code = (error.body as { code?: string } | null)?.code;
    if (code === 'wallet_locked_by_vault') {
      return t('Finish or leave your active group wallet before switching wallets.');
    }
    // The SIWS proof can take the key back from an unproven link, except while that account's
    // trip wallet is open (the key may be seated in it on-chain).
    if (code === 'wallet_claimed_in_open_vault') {
      return t(
        "This wallet is linked to another OnePlan account that's in an active trip. Ask them to finish or leave that trip.",
      );
    }
  }
  return mutationErrorMessage(error, t('Something went wrong'));
}

export function ConnectWalletCard({
  onConnected,
  onDisconnected,
  skrDomain = null,
  isSeeker = false,
}: ConnectWalletCardProps) {
  useAppLanguage();
  const { t } = useTranslation();
  // The provider republishes the handle when its connection loads, connects or resets — from
  // this card or anywhere else (deposit, sign-out) — so read it through a subscription.
  const kind = useSyncExternalStore(subscribeWalletHandle, vaultWalletKind);
  const liveAddress = useSyncExternalStore(subscribeWalletHandle, connectedVaultWalletAddress);
  // This card's own connect/disconnect result, bridging the one commit before the provider
  // republishes (it sets its state before `connect`/`reset` resolve, but publishes from an effect).
  // Dropped on every publish, so the handle is always the truth afterwards — a stale override
  // must never outlive a later reconnect from a withdraw/deposit/pay on the same screen.
  const [local, setLocal] = useState<{ address: string | null } | null>(null);
  useEffect(() => subscribeWalletHandle(() => setLocal(null)), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noWallet, setNoWallet] = useState(false);

  if (kind !== 'mwa') return null;

  const address = local !== null ? local.address : liveAddress;

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await connectVaultWallet();
      setLocal({ address: next });
      onConnected?.(next);
    } catch (e) {
      if (e instanceof WalletError && e.kind === 'walletNotInstalled') setNoWallet(true);
      else setError(connectErrorMessage(t, e));
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await resetVaultWallet();
      setLocal({ address: null });
      setError(null);
      onDisconnected?.();
    } finally {
      setBusy(false);
    }
  };

  if (address) {
    return (
      <View style={styles.card} testID="connect-wallet-card">
        <Text style={styles.title}>{t('Connected wallet')}</Text>
        <SeekerIdentityTag
          skrDomain={skrDomain}
          isSeeker={isSeeker}
          fallback={shortenAddress(address)}
        />
        <Pressable
          testID="connect-wallet-disconnect"
          style={styles.secondaryButton}
          onPress={() => void disconnect()}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel={t('Disconnect')}
          accessibilityState={{ busy, disabled: busy }}
        >
          <Text style={styles.secondaryLabel}>{t('Disconnect')}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.card} testID="connect-wallet-card">
      <Text style={styles.title}>{t('Connect your Solana wallet')}</Text>
      <Text style={styles.body}>
        {t(
          'Phantom, Solflare or Seed Vault signs every group-wallet payment. OnePlan never holds your keys.',
        )}
      </Text>
      <Pressable
        testID="connect-wallet-button"
        style={styles.button}
        onPress={() => void connect()}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={t('Connect wallet')}
        accessibilityState={{ busy, disabled: busy }}
      >
        {busy ? (
          <ActivityIndicator color={colors.white} />
        ) : (
          <Text style={styles.buttonLabel}>{t('Connect wallet')}</Text>
        )}
      </Pressable>
      {error ? (
        <Text testID="connect-wallet-error" style={styles.error}>
          {error}
        </Text>
      ) : null}
      <NoWalletAppSheet visible={noWallet} onClose={() => setNoWallet(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignSelf: 'stretch',
    backgroundColor: colors.neutral50,
    borderRadius: 24,
    padding: 20,
    gap: 10,
  },
  title: { ...beVietnamPro(17, 'semibold'), color: colors.contentB },
  body: { ...beVietnamPro(14), color: colors.contentM },
  button: {
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: colors.black,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonLabel: { ...beVietnamPro(15, 'semibold'), color: colors.white },
  secondaryButton: {
    minHeight: 42,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(0, 0, 0, 0.06)',
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryLabel: { ...beVietnamPro(15), color: colors.contentB },
  error: { ...beVietnamPro(13), color: colors.secondary },
});
