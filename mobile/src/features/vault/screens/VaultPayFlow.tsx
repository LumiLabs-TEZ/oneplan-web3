/**
 * The pay flow for a trip vault — scan a VietQR code, type an amount, fill in the expense, pay —
 * port of the scan/pay/receipt half of `TripVaultSection.swift` (`origin/feat/web3-version`).
 *
 * iOS drives this from full-screen covers owned by `TripVaultSection`; here it is a modal route
 * (`trip/[tripId]/vault/pay`) that `TripVaultSection`'s scan button pushes, so its sheets can host
 * their own `BottomSheetModalProvider`. The pieces are the ones Wave B built (`VaultScanQRScreen`,
 * `VaultPayAmountScreen`, `VaultExpenseSheet`) and the money moves through the real `payVault`
 * (`../api/pay.ts`): quote → prepare → verify → sign → submit. The amount screen stays mounted
 * under the expense sheet, so the typed amount survives dismissing the sheet.
 *
 * A payment that settles opens its receipt (approve/cancel there use the same real hooks); one
 * that is still waiting on the bank or on a second member's signature says so on the card through
 * `vaultAnnounceStore` instead, and never as an error — saying "failed" would invite a second
 * payment.
 */
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native';

import type { components } from '@/api/schema';
import { useMe } from '@/features/me/useMe';
import { useAppLanguage } from '@/i18n';
import { colors } from '@/ui/theme';

import {
  type PayRequest,
  useLookupVaultRecipient,
  usePayVault,
  vaultPayErrorMessage,
} from '../api/pay';
import { useVaultBalance, useVaultTransaction, useWallet } from '../api/queries';
import { decodeVietQr, type VietQrPayload } from '../solana/vietqr';
import { useVaultAnnounceStore } from '../vaultAnnounceStore';
import { mapVaultTransactionDetail } from './transactionDetailMapping';
import { VaultExpenseSheet, type VaultExpenseDetails, type VaultExpenseSheetRef } from './VaultExpenseSheet';
import { VaultPayAmountScreen } from './VaultPayAmountScreen';
import { VaultScanQRScreen } from './VaultScanQRScreen';
import { VaultTransactionDetailScreen } from './VaultTransactionDetailScreen';

type TripMemberDto = components['schemas']['TripMemberDto'];

/**
 * Only used for the indicative line while typing (`TripVaultSection.indicativeRate`). Every
 * binding number comes from the server at quote time and is re-checked in `payVault`.
 */
export const INDICATIVE_VND_PER_USDC = 26_500;

/** A scanned code on its way to becoming a payment. */
interface PendingPayment {
  payload: string;
  decoded: VietQrPayload;
  recipientName?: string;
  amountVnd?: string;
}

export interface VaultPayFlowProps {
  tripId: number;
  members: readonly TripMemberDto[];
  /** False once the trip has ended — the server refuses receipt edits then. */
  allowsEditing?: boolean;
  onClose: () => void;
}

export function VaultPayFlow({ tripId, members, allowsEditing = true, onClose }: VaultPayFlowProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const me = useMe();
  const balance = useVaultBalance(tripId);
  const wallet = useWallet();
  const lookup = useLookupVaultRecipient(tripId);
  const pay = usePayVault(tripId);
  const announce = useVaultAnnounceStore((s) => s.announce);
  const sheetRef = useRef<VaultExpenseSheetRef>(null);

  const [pending, setPending] = useState<PendingPayment | null>(null);
  const [paidId, setPaidId] = useState<number | null>(null);
  const receipt = useVaultTransaction(tripId, paidId, { enabled: paidId !== null });

  const balanceUsdc = Number(BigInt(balance.data?.balanceMicro ?? '0')) / 1_000_000;
  const personalUsdc = wallet.data ? Number(BigInt(wallet.data.balanceMicro)) / 1_000_000 : undefined;
  const balanceVnd = balanceUsdc * INDICATIVE_VND_PER_USDC;
  // The keypad's ceiling: the larger of the two wallets a payment can come from. The payer is
  // chosen on the next step, so refusing an amount the member's own wallet could cover would
  // block a valid payment.
  const capVnd = Math.max(balanceVnd, (personalUsdc ?? 0) * INDICATIVE_VND_PER_USDC);

  const amountVnd = pending?.amountVnd;
  useEffect(() => {
    if (amountVnd !== undefined) sheetRef.current?.present();
  }, [amountVnd]);

  const begin = (payload: VietQrPayload, raw: string) => {
    setPending({ payload: raw, decoded: payload });
    lookup.mutate(raw, {
      // Best effort: the screen shows "…" until this lands and never blocks on it.
      onSuccess: (found) =>
        setPending((current) =>
          current?.payload === raw ? { ...current, recipientName: found.recipientName } : current,
        ),
    });
  };

  const submit = (details: VaultExpenseDetails) => {
    if (!pending || pending.amountVnd === undefined) return;
    const request: PayRequest = {
      qrPayload: pending.payload,
      amountVnd: pending.amountVnd,
      name: details.name,
      category: details.category,
      shareWithUserIds: details.shareWithUserIds,
      source: details.payer,
    };
    pay.mutate(
      { request },
      {
        onSuccess: (outcome) => {
          if (outcome.kind === 'confirmed') {
            sheetRef.current?.dismiss();
            setPaidId(outcome.vaultTransactionId);
            return;
          }
          announce(
            outcome.kind === 'pending'
              ? t('Sent. Waiting on the bank to confirm.')
              : t('Over the trip limit. Waiting for a member to approve.'),
          );
          onClose();
        },
        // Left on screen on purpose: a failed payment keeps the amount and the details so it can
        // be sent again without typing them a second time.
        onError: (error) => Alert.alert(t('Payment failed'), vaultPayErrorMessage(error, t('Payment failed'))),
      },
    );
  };

  if (paidId !== null) {
    if (!receipt.data) {
      return (
        <View style={styles.center} testID="vault-pay-receipt-loading">
          <ActivityIndicator />
        </View>
      );
    }
    const sendAgain = receipt.data.qrPayload ? tryDecode(receipt.data.qrPayload) : null;
    return (
      <VaultTransactionDetailScreen
        detail={mapVaultTransactionDetail(receipt.data, pending?.recipientName ?? '')}
        tripId={tripId}
        vaultTransactionId={paidId}
        members={members}
        allowsEditing={allowsEditing}
        onBack={onClose}
        onSendAgain={
          sendAgain
            ? () => {
                // Straight to the amount: the recipient is already known.
                setPaidId(null);
                setPending({ payload: receipt.data!.qrPayload as string, decoded: sendAgain, recipientName: receipt.data!.recipientName });
              }
            : undefined
        }
        onApproved={onClose}
        onCancelled={onClose}
      />
    );
  }

  if (!pending) {
    return <VaultScanQRScreen onScanned={begin} onCancel={onClose} />;
  }

  return (
    <View style={styles.flex}>
      <VaultPayAmountScreen
        recipientName={pending.recipientName ?? '…'}
        balanceVnd={balanceVnd}
        capVnd={capVnd}
        prefilledAmountVnd={pending.decoded.amountVnd}
        indicativeRate={INDICATIVE_VND_PER_USDC}
        onBack={() => setPending(null)}
        onNext={(vnd) => setPending((current) => (current ? { ...current, amountVnd: vnd } : current))}
      />
      <VaultExpenseSheet
        ref={sheetRef}
        members={members}
        currentUser={me.data}
        personalBalanceUsdc={personalUsdc}
        fallbackName={pending.recipientName ?? ''}
        isWorking={pay.isPending}
        onDone={submit}
        // Pulling the sheet down returns to the amount, rather than trapping the user with no
        // way back.
        onDismiss={() =>
          setPending((current) => (current ? { ...current, amountVnd: undefined } : current))
        }
      />
    </View>
  );
}

function tryDecode(payload: string): VietQrPayload | null {
  try {
    return decodeVietQr(payload);
  } catch {
    return null;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
});
