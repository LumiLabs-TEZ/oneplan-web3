/** @jest-environment node */
import { GoogleSignin } from '@react-native-google-signin/google-signin';

import { createApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';
import { keys } from '@/api/keys';
import { queryClient } from '@/api/queryClient';

import { useAuthStore } from './authStore';
import { deleteAccount } from './deleteAccount';
import { tokenStore } from './tokenStore';

jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'http://x', linkHosts: [] } } },
}));

type Call = { method: string; path: string };
let calls: Call[] = [];
let deleteStatus = 204;

const fakeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? input : new Request(input, init);
  const { pathname } = new URL(request.url);
  calls.push({ method: request.method, path: pathname });
  if (pathname === '/auth/account') {
    return deleteStatus === 204
      ? new Response(null, { status: 204 })
      : new Response(JSON.stringify({ message: 'boom' }), {
          status: deleteStatus,
          headers: { 'content-type': 'application/json' },
        });
  }
  throw new Error(`unhandled ${request.url}`);
};

const api = createApiClient('http://x', fakeFetch);

beforeEach(async () => {
  calls = [];
  deleteStatus = 204;
  tokenStore._resetForTests();
  queryClient.clear();
  useAuthStore.setState({ status: 'authed', ready: true });
  await tokenStore.set({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 });
  jest.clearAllMocks();
});

afterAll(() => queryClient.clear());

describe('deleteAccount', () => {
  it('DELETEs /auth/account, signs out of Google, and clears the local session on success', async () => {
    queryClient.setQueryData(keys.me, { id: 1 });

    await deleteAccount({ api });

    expect(calls).toEqual([{ method: 'DELETE', path: '/auth/account' }]);
    expect(GoogleSignin.signOut).toHaveBeenCalled();
    expect(tokenStore.get()).toBeNull();
    expect(useAuthStore.getState().status).toBe('anon');
    expect(queryClient.getQueryData(keys.me)).toBeUndefined();
  });

  it('throws ApiMutationError and leaves the session untouched on failure', async () => {
    deleteStatus = 500;

    await expect(deleteAccount({ api })).rejects.toBeInstanceOf(ApiMutationError);

    expect(GoogleSignin.signOut).not.toHaveBeenCalled();
    expect(tokenStore.get()).not.toBeNull();
    expect(useAuthStore.getState().status).toBe('authed');
  });
});
