/**
 * Port of `TripVaultSection.swift` (`origin/feat/web3-version`) — the vault orchestrator embedded
 * in Trip Detail in place of the classic `HomeCard`. Wave A owns the deposit-chain subset of its
 * state (deposit options → contribute → depositing → result); pay/approve state (Wave B) and
 * settlement/history reactions (C/D) extend this component later rather than duplicating its
 * state machine in a second one (`docs/web3/rn-ui-parity-inventory.md` `trip-vault-section` row).
 *
 * The pay flow (scan → amount → expense → `payVault` → receipt) runs on its own modal route,
 * `trip/[tripId]/vault/pay` (`VaultPayFlow`); the scan button pushes it, and a payment that ends
 * "pending"/"awaiting approval" comes back here as the `vaultAnnounceStore` banner.
 */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { BottomSheetView } from '@gorhom/bottom-sheet';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { useAppLanguage } from '@/i18n';
import type { Currency } from '@/lib/currency';
import { AppSheet, type AppSheetRef, SFSymbol } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { mutationErrorMessage } from '@/api/mutationError';
import { useMe } from '@/features/me/useMe';
import { CurrencyFormatter } from '@/lib/currency';
import { useRealtimeStore } from '@/realtime/realtimeStore';

import { useApproveVaultTransaction } from '../api/pay';
import { useVaultBalance, useMyVaultWallet } from '../api/queries';
import { TripVaultCard } from '../components';
import { setVaultContributeRequestListener } from '../contributeHandoff';
import { shouldPromptApproval } from '../helpers/approvalPrompt';
import { useDepositToVault } from '../signing/depositFlow';
import { VAULT_PROGRAM_ID } from '../solana/constants';
import { deriveVaultPda } from '../solana/pda';
import { useVaultAnnounceStore } from '../vaultAnnounceStore';
import { useVaultDepositFlowStore, vaultDepositFlowStore } from '../vaultDepositFlowStore';
import { ContributeToVaultSheet } from './ContributeToVaultSheet';
import { DepositOptionsSheet } from './DepositOptionsSheet';
import { VaultDepositingSheet } from './VaultDepositingSheet';
import { walletErrorMessage } from './walletErrorMessage';

type Stage = 'closed' | 'options' | 'contribute' | 'depositing';

const ANNOUNCE_MS = 3000;

export interface TripVaultSectionProps {
  tripId: number;
  tripName: string;
  coverImageUrl?: string | null;
  /** Vault balance already converted to the trip's home currency by the caller. */
  balanceInHomeCurrency: number;
  homeCurrency: string | Currency;
  isWaitingForEndApproval?: boolean;
  onWaitingForApproval?: () => void;
  /**
   * A leave-settle deposit (Contribute opened locked from the leave sheet) landed — iOS posts
   * `.vaultLeaveDepositCompleted` here and Trip Detail announces the leave.
   */
  onLeaveDepositCompleted?: () => void;
}

export function TripVaultSection({
  tripId,
  tripName,
  coverImageUrl,
  balanceInHomeCurrency,
  homeCurrency,
  isWaitingForEndApproval = false,
  onWaitingForApproval,
  onLeaveDepositCompleted,
}: TripVaultSectionProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const balance = useVaultBalance(tripId);
  const myWallet = useMyVaultWallet(tripId);
  const deposit = useDepositToVault(tripId);
  const sheetRef = useRef<AppSheetRef>(null);
  const [stage, setStage] = useState<Stage>('closed');
  const [depositAmount, setDepositAmount] = useState<bigint | null>(null);
  /** Non-null = leave settle: Contribute opens with this amount fixed and no keypad. */
  const [lockedMicro, setLockedMicro] = useState<bigint | null>(null);
  const me = useMe();
  const approve = useApproveVaultTransaction(tripId);

  const balanceUsdc = Number(BigInt(balance.data?.balanceMicro ?? '0')) / 1_000_000;
  // The vault's address, derived from the trip id rather than read from the server's balance
  // response — it is shown as the deposit destination, so it must be the one the signer verified.
  const vaultAddress = deriveVaultPda(tripId, VAULT_PROGRAM_ID);

  const depositStatus = useVaultDepositFlowStore((s) => s.flow?.status) ?? 'processing';

  const announcement = useVaultAnnounceStore((s) => s.message);
  const clearAnnouncement = useVaultAnnounceStore((s) => s.clear);
  useEffect(() => {
    if (announcement === null) return undefined;
    const timer = setTimeout(clearAnnouncement, ANNOUNCE_MS);
    return () => clearTimeout(timer);
  }, [announcement, clearAnnouncement]);

  const openDeposit = () => {
    setLockedMicro(null);
    setStage('options');
    sheetRef.current?.present();
  };
  const closeSheet = () => {
    sheetRef.current?.dismiss();
    setStage('closed');
  };

  const onOnchain = () => setStage('contribute');

  // The receipt's "Deposit again" pops back here and asks for a fresh contribute sheet.
  useEffect(() => {
    const reopen = () => {
      if (!useVaultDepositFlowStore.getState().depositAgainRequested) return;
      useVaultDepositFlowStore.getState().consumeDepositAgain();
      // Don't clear the flow here: the receipt is still animating out and would flash blank.
      // The next contribute's `start()` replaces it.
      setDepositAmount(null);
      setLockedMicro(null);
      setStage('contribute');
      sheetRef.current?.present();
    };
    reopen();
    return useVaultDepositFlowStore.subscribe(reopen);
  }, []);

  // The leave sheet's "Deposit" hands over the exact amount owed: never a free keypad from here.
  useEffect(
    () =>
      setVaultContributeRequestListener((requestTripId, grossDepositMicro) => {
        if (requestTripId !== tripId || grossDepositMicro <= 0) return;
        setLockedMicro(BigInt(grossDepositMicro));
        setStage('contribute');
        sheetRef.current?.present();
      }),
    [tripId],
  );

  // Someone else's payment is waiting on a second signature. It is asked for rather than left in
  // the history: until somebody signs it the merchant has not been paid.
  const approvalRequest = useRealtimeStore((s) => s.lastVaultApprovalRequested);
  const myUserId = me.data?.id;
  useEffect(() => {
    if (approvalRequest?.tripId !== tripId) return;
    if (!useRealtimeStore.getState().consumeEffect('vaultApprovalRequested', tripId)) return;
    if (!shouldPromptApproval(approvalRequest, tripId, myUserId)) return;
    Alert.alert(
      t('Approval needed'),
      t('%@ to %@ is over the trip limit.', {
        0: `đ${CurrencyFormatter.formatWhole(Number(approvalRequest.amountVnd))}`,
        1: approvalRequest.recipientName,
      }),
      [
        { text: t('Not now'), style: 'cancel' },
        {
          text: t('Approve'),
          onPress: () =>
            approve.mutate(
              { vaultTransactionId: approvalRequest.vaultTransactionId },
              {
                onSuccess: () => useVaultAnnounceStore.getState().announce(t('Approved')),
                onError: (error) =>
                  Alert.alert(
                    walletErrorMessage(t, error) ??
                      mutationErrorMessage(error, t('Something went wrong')),
                  ),
              },
            ),
        },
      ],
    );
  }, [approvalRequest, tripId, myUserId, approve, t]);

  const onContribute = (amountMicro: bigint) => {
    setDepositAmount(amountMicro);
    setStage('depositing');
    vaultDepositFlowStore.start({
      amountMicro,
      recipient: vaultAddress,
      date: Date.now(),
    });
    const isLeaveSettle = lockedMicro !== null;
    deposit.mutate(amountMicro, {
      onSuccess: (result) => {
        if (!isLeaveSettle) {
          vaultDepositFlowStore.complete(result.signature);
          return;
        }
        // Leave settle skips the receipt: the leave sheet's pending state is the confirmation.
        vaultDepositFlowStore.clear();
        setLockedMicro(null);
        closeSheet();
        onLeaveDepositCompleted?.();
      },
      onError: (error) => {
        vaultDepositFlowStore.clear();
        Alert.alert(
          t('Deposit failed'),
          walletErrorMessage(t, error) ?? mutationErrorMessage(error, t('Deposit failed')),
        );
        setStage('contribute');
      },
    });
  };

  const onDetails = () => {
    closeSheet();
    router.push({
      pathname: '/trip/[tripId]/vault/deposit-result',
      params: { tripId: String(tripId) },
    });
  };

  return (
    <View>
      {announcement !== null ? (
        <View style={styles.announcement} testID="trip-vault-announcement" pointerEvents="none">
          <SFSymbol
            name="checkmark.circle.fill"
            fallback="checkmark-circle"
            size={16}
            color={colors.white}
          />
          <Text style={styles.announcementText}>{announcement}</Text>
        </View>
      ) : null}
      <TripVaultCard
        tripName={tripName}
        coverImageUrl={coverImageUrl}
        balance={balanceInHomeCurrency}
        currency={homeCurrency}
        balanceUsdc={balanceUsdc}
        isWaitingForEndApproval={isWaitingForEndApproval}
        onDeposit={openDeposit}
        onScanQR={() =>
          router.push({ pathname: '/trip/[tripId]/vault/pay', params: { tripId: String(tripId) } })
        }
        onWaitingForApproval={onWaitingForApproval}
      />

      <AppSheet
        ref={sheetRef}
        enableDynamicSizing
        onDismiss={() => {
          setStage('closed');
          setLockedMicro(null);
        }}
      >
        {/* Dynamic sizing only measures content inside a BottomSheetView; plain Views report no
            height, so the sheet presented at 0pt and Deposit looked dead. */}
        <BottomSheetView>
          {stage === 'options' ? <DepositOptionsSheet onOnchain={onOnchain} /> : null}
          {stage === 'contribute' ? (
            <ContributeToVaultSheet
              tripId={tripId}
              prefilledAmountMicro={lockedMicro ?? undefined}
              locksAmount={lockedMicro !== null}
              onContribute={onContribute}
              onFundWallet={() => {
                closeSheet();
                router.push('/wallet/deposit');
              }}
            />
          ) : null}
          {stage === 'depositing' && depositAmount !== null ? (
            <VaultDepositingSheet
              amountMicro={depositAmount}
              fromAddress={myWallet.data?.publicKey ?? ''}
              toAddress={vaultAddress}
              status={depositStatus}
              onDetails={onDetails}
              onDone={closeSheet}
            />
          ) : null}
        </BottomSheetView>
      </AppSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  // Same chrome as the wallet's copied toast: neutral, not brand-green.
  announcement: {
    position: 'absolute',
    top: 8,
    alignSelf: 'center',
    zIndex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: 'rgba(23, 23, 23, 0.92)',
  },
  announcementText: { ...beVietnamPro(15), letterSpacing: -0.3, color: colors.white },
});
