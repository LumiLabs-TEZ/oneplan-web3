import { createTestQueryClient } from '@/testSupport/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import type { FriendDto, FriendRequestDto } from '../types';
import {
  cancelSentFriendRequest,
  respondToFriendRequest,
  sendFriendRequest,
  unfriend,
  useDeclineFriendRequest,
  useRespondFriendRequest,
  useUnfriend,
} from './mutations';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const noContent = () => new Response(null, { status: 204 });

function makeWrapper(qc: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  }
  return Wrapper;
}

describe('sendFriendRequest', () => {
  it('POSTs the friend code', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return new Response(null, { status: 201 });
      }),
    );
    await sendFriendRequest('abc123', api);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/friends/request');
    expect(await calls[0]!.json()).toEqual({ friendCode: 'abc123' });
  });

  it('throws ApiMutationError on 400', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Already friends' }, 400)),
    );
    await expect(sendFriendRequest('abc123', api)).rejects.toBeInstanceOf(ApiMutationError);
  });
});

describe('cancelSentFriendRequest', () => {
  it('DELETEs /friends/request/{code}', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return noContent();
      }),
    );
    await cancelSentFriendRequest('abc123', api);
    expect(calls[0]?.method).toBe('DELETE');
    expect(new URL(calls[0]!.url).pathname).toBe('/friends/request/abc123');
  });
});

describe('respondToFriendRequest', () => {
  it('PATCHes /friends/request/{id}/respond with accept', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return noContent();
      }),
    );
    await respondToFriendRequest(5, true, api);
    expect(calls[0]?.method).toBe('PATCH');
    expect(new URL(calls[0]!.url).pathname).toBe('/friends/request/5/respond');
    expect(await calls[0]!.json()).toEqual({ accept: true });
  });
});

describe('unfriend', () => {
  it('DELETEs /friends/{friendshipId}', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return noContent();
      }),
    );
    await unfriend(7, api);
    expect(calls[0]?.method).toBe('DELETE');
    expect(new URL(calls[0]!.url).pathname).toBe('/friends/7');
  });

  it('throws ApiMutationError on failure', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Not found' }, 404)),
    );
    await expect(unfriend(7, api)).rejects.toBeInstanceOf(ApiMutationError);
  });
});

const request: FriendRequestDto = {
  id: 5,
  sender: {
    id: 6,
    displayName: 'Bao',
    avatarUrl: null,
    isPro: true,
    memberSince: '2025-01-01T00:00:00.000Z',
  },
  mutualFriendCount: 1,
  createdAt: '2026-01-02T00:00:00.000Z',
};

const friend: FriendDto = {
  friendshipId: 1,
  user: { id: 2, displayName: 'Anh', avatarUrl: null, isPro: false },
  mutualFriendCount: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('useRespondFriendRequest', () => {
  it('removes the request from cache and invalidates friends.all on accept', async () => {
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    qc.setQueryData(keys.friends.requests, [request]);
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    const api = createApiClient(
      'http://x',
      fakeFetch(() => noContent()),
    );

    const { result } = await renderHook(() => useRespondFriendRequest(api), {
      wrapper: makeWrapper(qc),
    });
    await act(async () => {
      await result.current.mutateAsync({ id: 5, accept: true });
    });

    expect(qc.getQueryData(keys.friends.requests)).toEqual([]);
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidatedKeys).toContainEqual(keys.friends.all);
  });

  it('removes the request from cache without invalidating friends.all on decline', async () => {
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    qc.setQueryData(keys.friends.requests, [request]);
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    const api = createApiClient(
      'http://x',
      fakeFetch(() => noContent()),
    );

    const { result } = await renderHook(() => useRespondFriendRequest(api), {
      wrapper: makeWrapper(qc),
    });
    await act(async () => {
      await result.current.mutateAsync({ id: 5, accept: false });
    });

    expect(qc.getQueryData(keys.friends.requests)).toEqual([]);
    const invalidatedKeys = invalidateSpy.mock.calls.map((c) => c[0]?.queryKey);
    expect(invalidatedKeys).not.toContainEqual(keys.friends.all);
  });
});

describe('useDeclineFriendRequest', () => {
  it('drops the request from cache and PATCHes accept=false', async () => {
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    qc.setQueryData(keys.friends.requests, [request]);
    const bodies: unknown[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch(async (req) => {
        bodies.push(await req.json());
        return noContent();
      }),
    );

    const { result } = await renderHook(() => useDeclineFriendRequest(api), {
      wrapper: makeWrapper(qc),
    });
    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(qc.getQueryData(keys.friends.requests)).toEqual([]);
    expect(bodies[0]).toEqual({ accept: false });
  });

  it('restores the request when the decline fails', async () => {
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    qc.setQueryData(keys.friends.requests, [request]);
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'boom' }, 500)),
    );

    const { result } = await renderHook(() => useDeclineFriendRequest(api), {
      wrapper: makeWrapper(qc),
    });
    await act(async () => {
      await expect(result.current.mutateAsync(5)).rejects.toBeInstanceOf(ApiMutationError);
    });

    expect(qc.getQueryData(keys.friends.requests)).toEqual([request]);
  });
});

describe('useUnfriend', () => {
  it('optimistically removes the friend before the request resolves', async () => {
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    qc.setQueryData(keys.friends.all, [friend]);
    const api = createApiClient(
      'http://x',
      fakeFetch(() => noContent()),
    );

    const { result } = await renderHook(() => useUnfriend(api), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(qc.getQueryData(keys.friends.all)).toEqual([]);
  });

  it('restores the previous list when the delete fails', async () => {
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    qc.setQueryData(keys.friends.all, [friend]);
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'boom' }, 500)),
    );

    const { result } = await renderHook(() => useUnfriend(api), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await expect(result.current.mutateAsync(1)).rejects.toBeInstanceOf(ApiMutationError);
    });

    expect(qc.getQueryData(keys.friends.all)).toEqual([friend]);
  });
});
