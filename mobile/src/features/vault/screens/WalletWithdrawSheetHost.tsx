/**
 * The withdraw form in a floating, content-sized sheet (same presentation as Contribute). On
 * submit the sheet closes and the result opens as its own full-screen route; the result's
 * "Send again" comes back here and reopens the form. Shared by Profile and the wallet detail.
 */
import { BottomSheetView } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { useKeyboardHeight } from '@/lib/useKeyboardHeight';
import { AppSheet, type AppSheetRef } from '@/ui/components/AppSheet';

import { useWalletWithdrawResultStore } from '../walletWithdrawResultStore';
import { WalletWithdrawSheet } from './WalletWithdrawSheet';

/** `AppSheet`'s floating-sheet gap above the home indicator / keyboard. */
const FLOATING_INSET = 9;

/** Settlement "Pay": the creditor's wallet and the cash-debt amount. */
export interface WalletWithdrawPrefill {
  address: string;
  amountMicro: bigint;
}

export interface WalletWithdrawSheetHostRef {
  present: (prefill?: WalletWithdrawPrefill) => void;
}

export const WalletWithdrawSheetHost = forwardRef<WalletWithdrawSheetHostRef>(
  function WalletWithdrawSheetHost(_props, ref) {
    const sheetRef = useRef<AppSheetRef>(null);
    const keyboardHeight = useKeyboardHeight();
    // A new key per open re-runs the form's initial state, so a prefill always lands (and a
    // plain open after a prefilled one starts empty).
    const [form, setForm] = useState<{ key: number; prefill?: WalletWithdrawPrefill }>({ key: 0 });
    useImperativeHandle(
      ref,
      () => ({
        present: (prefill) => {
          setForm((current) => ({ key: current.key + 1, prefill }));
          sheetRef.current?.present();
        },
      }),
      [],
    );

    useEffect(() => {
      const reopen = () => {
        if (!useWalletWithdrawResultStore.getState().sendAgainRequested) return;
        useWalletWithdrawResultStore.getState().consumeSendAgain();
        sheetRef.current?.present();
      };
      reopen();
      return useWalletWithdrawResultStore.subscribe(reopen);
    }, []);

    return (
      // Lifted by the keyboard height (address field) — gorhom's own offset leaves a floating
      // sheet behind the keyboard; same pattern as `EditDisplayNameSheet`.
      <AppSheet
        ref={sheetRef}
        enableDynamicSizing
        bottomInset={Platform.OS === 'ios' ? keyboardHeight + FLOATING_INSET : FLOATING_INSET}
        android_keyboardInputMode="adjustPan"
      >
        <BottomSheetView>
          <WalletWithdrawSheet
            key={form.key}
            prefilledAddress={form.prefill?.address}
            prefilledAmountMicro={form.prefill?.amountMicro}
            onSubmitted={(result) => {
              useWalletWithdrawResultStore.getState().setResult(result);
              sheetRef.current?.dismiss();
              router.push('/wallet/withdraw-result');
            }}
          />
        </BottomSheetView>
      </AppSheet>
    );
  },
);
