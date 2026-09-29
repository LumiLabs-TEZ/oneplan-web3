import { useVaultDepositFlowStore, vaultDepositFlowStore } from './vaultDepositFlowStore';

afterEach(() => {
  vaultDepositFlowStore.clear();
});

describe('vaultDepositFlowStore', () => {
  it('start() sets a processing flow with no signature', () => {
    vaultDepositFlowStore.start({ amountMicro: 5_000_000n, recipient: 'PDA', date: 1000 });
    expect(useVaultDepositFlowStore.getState().flow).toEqual({
      amountMicro: 5_000_000n,
      recipient: 'PDA',
      date: 1000,
      status: 'processing',
      signature: '',
    });
  });

  it('complete() flips status to completed and sets the signature, keeping other fields', () => {
    vaultDepositFlowStore.start({ amountMicro: 5_000_000n, recipient: 'PDA', date: 1000 });
    vaultDepositFlowStore.complete('SIG');
    expect(useVaultDepositFlowStore.getState().flow).toEqual({
      amountMicro: 5_000_000n,
      recipient: 'PDA',
      date: 1000,
      status: 'completed',
      signature: 'SIG',
    });
  });

  it('complete() is a no-op when there is no active flow', () => {
    vaultDepositFlowStore.complete('SIG');
    expect(useVaultDepositFlowStore.getState().flow).toBeNull();
  });

  it('clear() removes the flow', () => {
    vaultDepositFlowStore.start({ amountMicro: 1n, recipient: 'X', date: 0 });
    vaultDepositFlowStore.clear();
    expect(useVaultDepositFlowStore.getState().flow).toBeNull();
  });
});
