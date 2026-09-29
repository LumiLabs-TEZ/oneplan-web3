import { resolveWeb3Enabled, useWeb3FlagStore } from './web3Flag';

beforeEach(() => {
  useWeb3FlagStore.setState({ override: null });
});

describe('resolveWeb3Enabled', () => {
  it('defaults ON for local and dev variants', () => {
    expect(resolveWeb3Enabled('local', null)).toBe(true);
    expect(resolveWeb3Enabled('dev', null)).toBe(true);
  });

  it('defaults OFF for prod', () => {
    expect(resolveWeb3Enabled('prod', null)).toBe(false);
  });

  it('an override flips local/dev either way', () => {
    expect(resolveWeb3Enabled('dev', false)).toBe(false);
    expect(resolveWeb3Enabled('local', true)).toBe(true);
  });

  it('prod ignores any override — fails closed', () => {
    expect(resolveWeb3Enabled('prod', true)).toBe(false);
  });
});

describe('useWeb3FlagStore', () => {
  it('starts with no override', () => {
    expect(useWeb3FlagStore.getState().override).toBeNull();
  });

  it('setOverride writes and clears the chosen value', () => {
    useWeb3FlagStore.getState().setOverride(false);
    expect(useWeb3FlagStore.getState().override).toBe(false);
    useWeb3FlagStore.getState().setOverride(null);
    expect(useWeb3FlagStore.getState().override).toBeNull();
  });
});
