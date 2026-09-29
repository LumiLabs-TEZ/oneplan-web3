import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef } from 'react';

import { initI18n } from '@/i18n';

import { VaultLeaveHostSheet, type VaultLeaveHostSheetRef } from './VaultLeaveHostSheet';

const waitingRequest = {
  tripId: 5,
  userId: 9,
  displayName: 'Ken',
  netMicro: '-2000000',
  announcedNetMicro: '0',
  status: 'WAITING_DEPOSIT',
  walletAddress: null,
  requestedAt: '2026-09-28T10:00:00Z',
};

const readyRequest = {
  ...waitingRequest,
  netMicro: '0',
  announcedNetMicro: '1500000',
  status: 'READY',
};

const payoutRequest = {
  ...waitingRequest,
  netMicro: '3000000',
  announcedNetMicro: '3000000',
  status: 'PAYOUT',
  walletAddress: 'HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL',
};

describe('VaultLeaveHostSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('WAITING_DEPOSIT: dismisses on tap without calling onConfirm', async () => {
    const onConfirm = jest.fn();
    const ref = createRef<VaultLeaveHostSheetRef>();
    const screen = await render(
      <VaultLeaveHostSheet ref={ref} request={waitingRequest} onConfirm={onConfirm} />,
    );
    await act(async () => ref.current?.present());

    expect(screen.getByText('Ken is leaving')).toBeTruthy();
    expect(screen.getByText('Waiting for settlement')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('vault-leave-host-cta'));
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('READY: calls onConfirm and moves to the left phase on success', async () => {
    const onConfirm = jest.fn().mockResolvedValue(true);
    const ref = createRef<VaultLeaveHostSheetRef>();
    const screen = await render(
      <VaultLeaveHostSheet ref={ref} request={readyRequest} onConfirm={onConfirm} />,
    );
    await act(async () => ref.current?.present());

    expect(screen.getByText('Received')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('vault-leave-host-cta')));
    expect(onConfirm).toHaveBeenCalledWith(readyRequest);
    expect(screen.getByText('Ken left')).toBeTruthy();
  });

  it('PAYOUT: shows the shortened address card and "Approve & send"', async () => {
    const onConfirm = jest.fn().mockResolvedValue(false);
    const ref = createRef<VaultLeaveHostSheetRef>();
    const screen = await render(
      <VaultLeaveHostSheet ref={ref} request={payoutRequest} onConfirm={onConfirm} />,
    );
    await act(async () => ref.current?.present());

    expect(screen.getByText('Confirm action')).toBeTruthy();
    expect(screen.getByTestId('vault-leave-host-payout-address')).toBeTruthy();
    expect(screen.getByText('HcBi...tLAL')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('vault-leave-host-cta')));
    expect(onConfirm).toHaveBeenCalledWith(payoutRequest);
    // onConfirm resolved false ("member was NOT removed") — stays in request phase.
    expect(screen.getByText('Confirm action')).toBeTruthy();
  });

  it('stale PAYOUT under dust behaves like READY (no address card, Received badge)', async () => {
    const staleRequest = { ...payoutRequest, netMicro: '5000', announcedNetMicro: '5000' };
    const onConfirm = jest.fn();
    const ref = createRef<VaultLeaveHostSheetRef>();
    const screen = await render(
      <VaultLeaveHostSheet ref={ref} request={staleRequest} onConfirm={onConfirm} />,
    );
    await act(async () => ref.current?.present());

    expect(screen.queryByTestId('vault-leave-host-payout-address')).toBeNull();
    expect(screen.getByText('Received')).toBeTruthy();
  });
});
