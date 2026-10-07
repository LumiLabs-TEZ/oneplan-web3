import { createApiClient } from '@/api/client';

import {
  _resetWalletTokenFailureForTests,
  fetchWalletTokenWithRetry,
  lastWalletTokenFailure,
} from './walletToken';

function apiReturning(statuses: number[]) {
  const calls: string[] = [];
  const fakeFetch: typeof fetch = async (input) => {
    calls.push(input instanceof Request ? input.url : String(input));
    const status = statuses.shift() ?? 500;
    return new Response(status === 200 ? JSON.stringify({ token: 'jwt' }) : '{}', {
      status,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { api: createApiClient('http://x', fakeFetch), calls };
}

afterEach(() => _resetWalletTokenFailureForTests());

describe('fetchWalletTokenWithRetry', () => {
  it('retries a transient failure instead of giving Privy an empty token', async () => {
    const { api, calls } = apiReturning([503, 200]);
    await expect(fetchWalletTokenWithRetry(api, [0, 0])).resolves.toBe('jwt');
    expect(calls).toHaveLength(2);
    expect(lastWalletTokenFailure()).toBeNull();
  });

  it('gives up after every retry and remembers why', async () => {
    const { api, calls } = apiReturning([503, 503, 403]);
    await expect(fetchWalletTokenWithRetry(api, [0, 0])).rejects.toThrow();
    expect(calls).toHaveLength(3);
    expect(lastWalletTokenFailure()).toBe('HTTP 403');
  });
});
