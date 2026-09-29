import { createTestQueryClient } from '@/testSupport/queryClient';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import {
  applyStatus,
  fetchAppAccountToken,
  syncSubscription,
  validateAppleTransaction,
  verifyPlayPurchase,
} from './mutations';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const proStatus = {
  status: 'ACTIVE',
  tier: 'pro_yearly',
  productId: 'pro_yearly',
  expiresAt: null,
  autoRenewEnabled: true,
  gracePeriodExpiresAt: null,
};

describe('validateAppleTransaction', () => {
  it('POSTs the jws body and returns the status', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(proStatus, 201);
      }),
    );
    const res = await validateAppleTransaction('jws-token', api);
    expect(res).toEqual(proStatus);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/subscription/validate');
    expect(await calls[0]!.json()).toEqual({ jws: 'jws-token' });
  });

  it('throws an ApiMutationError carrying the status on 400', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => new Response(null, { status: 400 })),
    );
    await expect(validateAppleTransaction('bad', api)).rejects.toMatchObject({
      status: 400,
    });
    await expect(validateAppleTransaction('bad', api)).rejects.toBeInstanceOf(ApiMutationError);
  });
});

describe('verifyPlayPurchase', () => {
  it('POSTs the purchase body and returns the status', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(proStatus, 200);
      }),
    );
    const body = {
      packageName: 'com.oneplan.app',
      productId: 'pro_yearly',
      purchaseToken: 'token-1',
    };
    const res = await verifyPlayPurchase(body, api);
    expect(res).toEqual(proStatus);
    expect(new URL(calls[0]!.url).pathname).toBe('/subscription/play/verify');
    expect(await calls[0]!.json()).toEqual(body);
  });

  it('throws an ApiMutationError on 400', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => new Response(null, { status: 400 })),
    );
    await expect(
      verifyPlayPurchase(
        { packageName: 'com.oneplan.app', productId: 'pro_yearly', purchaseToken: 't' },
        api,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('fetchAppAccountToken', () => {
  it('GETs the app-account-token and returns the uuid', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ appAccountToken: 'uuid-1' });
      }),
    );
    const token = await fetchAppAccountToken(api);
    expect(token).toBe('uuid-1');
    expect(new URL(calls[0]!.url).pathname).toBe('/subscription/app-account-token');
  });
});

describe('syncSubscription', () => {
  it('POSTs /subscription/sync and returns the status', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(proStatus);
      }),
    );
    const res = await syncSubscription(api);
    expect(res).toEqual(proStatus);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/subscription/sync');
  });

  it('throws an ApiMutationError carrying 503 when sync is unavailable', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => new Response(null, { status: 503 })),
    );
    await expect(syncSubscription(api)).rejects.toMatchObject({ status: 503 });
  });

  it('throws an ApiMutationError carrying 400 when no linked subscription is found', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => new Response(null, { status: 400 })),
    );
    await expect(syncSubscription(api)).rejects.toMatchObject({ status: 400 });
  });
});

describe('applyStatus', () => {
  it('sets the subscription status query data', () => {
    const qc = createTestQueryClient();
    applyStatus(qc, proStatus as never);
    expect(qc.getQueryData(keys.subscription.status)).toEqual(proStatus);
  });
});
