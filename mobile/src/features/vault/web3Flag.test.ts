import { resolveWeb3Enabled, useWeb3FlagStore } from './web3Flag';

beforeEach(() => {
  useWeb3FlagStore.setState({ override: null });
});

const ELIGIBLE = { eligible: true, hasWeb3Trip: false };
const MEMBER_ONLY = { eligible: false, hasWeb3Trip: true };
const NEITHER = { eligible: false, hasWeb3Trip: false };

describe('resolveWeb3Enabled', () => {
  it('is ON for an eligible account on local/dev', () => {
    expect(resolveWeb3Enabled('local', null, ELIGIBLE)).toBe(true);
    expect(resolveWeb3Enabled('dev', null, ELIGIBLE)).toBe(true);
  });

  it('hasWeb3Trip never enables anything: a non-eligible member of a web3 trip sees no web3', () => {
    expect(resolveWeb3Enabled('dev', null, MEMBER_ONLY)).toBe(false);
  });

  it('is OFF when the server says neither eligible nor a web3-trip member', () => {
    expect(resolveWeb3Enabled('dev', null, NEITHER)).toBe(false);
  });

  it('fails closed until the server has answered (loading / error / dark server)', () => {
    expect(resolveWeb3Enabled('dev', null, undefined)).toBe(false);
    expect(resolveWeb3Enabled('local', null, null)).toBe(false);
  });

  it('the override can turn web3 OFF but never force it ON against the server', () => {
    expect(resolveWeb3Enabled('dev', false, ELIGIBLE)).toBe(false);
    expect(resolveWeb3Enabled('dev', true, NEITHER)).toBe(false);
    expect(resolveWeb3Enabled('local', true, undefined)).toBe(false);
  });

  it('prod is forced OFF whatever the server says', () => {
    expect(resolveWeb3Enabled('prod', null, ELIGIBLE)).toBe(false);
    expect(resolveWeb3Enabled('prod', true, ELIGIBLE)).toBe(false);
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
