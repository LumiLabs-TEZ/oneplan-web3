import {
  _resetVaultContributeListenersForTests,
  requestVaultContribute,
  setVaultContributeRequestListener,
} from './contributeHandoff';

afterEach(() => {
  _resetVaultContributeListenersForTests();
});

describe('vault contribute handoff', () => {
  it('notifies every registered listener with the tripId and amount', () => {
    const a = jest.fn();
    const b = jest.fn();
    setVaultContributeRequestListener(a);
    setVaultContributeRequestListener(b);

    requestVaultContribute(5, 2_020_202);

    expect(a).toHaveBeenCalledWith(5, 2_020_202);
    expect(b).toHaveBeenCalledWith(5, 2_020_202);
  });

  it('a listener stops receiving events after unregistering', () => {
    const listener = jest.fn();
    const unregister = setVaultContributeRequestListener(listener);

    unregister();
    requestVaultContribute(5, 1_000_000);

    expect(listener).not.toHaveBeenCalled();
  });

  it('is a no-op with no listeners registered', () => {
    expect(() => requestVaultContribute(5, 1_000_000)).not.toThrow();
  });
});
