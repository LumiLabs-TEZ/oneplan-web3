import { QueryClient } from '@tanstack/react-query';

import { storage } from './mmkv';
import {
  createAppQueryClient,
  createPersister,
  mmkvQueryStorage,
  persistOptions,
} from './persister';

jest.mock('expo-application', () => ({ nativeApplicationVersion: '1.5.0' }));

async function flush() {
  await new Promise((r) => setTimeout(r, 10));
}

const clients: QueryClient[] = [];
function track(client: QueryClient) {
  clients.push(client);
  return client;
}

beforeEach(() => storage.clearAll());
// QueryClient keeps gc timers alive — clear them so Jest exits.
afterEach(() => {
  for (const c of clients.splice(0)) c.clear();
});

describe('query persister over MMKV', () => {
  it('persists only queries with meta.persist and restores them into a fresh client', async () => {
    const client = track(createAppQueryClient(createPersister({ buster: 'v1' })));
    await client.fetchQuery({
      queryKey: ['trips', 1],
      queryFn: async () => ({ id: 1 }),
      meta: { persist: true },
    });
    await client.fetchQuery({ queryKey: ['volatile'], queryFn: async () => 'x' });
    await flush();

    const persisted = (await mmkvQueryStorage.entries!()) as [string, string][];
    expect(persisted).toHaveLength(1);
    expect(persisted[0]![0]).toContain('oneplan.query');

    const fresh = track(createAppQueryClient(createPersister({ buster: 'v1' })));
    const fetcher = jest.fn(async () => ({ id: 'network' }));
    const data = await fresh.fetchQuery({
      queryKey: ['trips', 1],
      queryFn: fetcher,
      meta: { persist: true },
      staleTime: Infinity,
    });
    expect(data).toEqual({ id: 1 });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('drops the cache when the buster changes', async () => {
    const client = track(createAppQueryClient(createPersister({ buster: 'v1' })));
    await client.fetchQuery({
      queryKey: ['trips', 2],
      queryFn: async () => 'old',
      meta: { persist: true },
    });
    await flush();

    const next = track(createAppQueryClient(createPersister({ buster: 'v2' })));
    const data = await next.fetchQuery({
      queryKey: ['trips', 2],
      queryFn: async () => 'new',
      meta: { persist: true },
      staleTime: Infinity,
    });
    expect(data).toBe('new');
  });

  it('plain QueryClient without persister never touches storage', async () => {
    const client = track(new QueryClient());
    await client.fetchQuery({ queryKey: ['a'], queryFn: async () => 1 });
    expect(storage.getAllKeys()).toEqual([]);
  });
});

describe('gc times', () => {
  it('memory-only queries are collected after 10 minutes, persisted ones keep the max age', () => {
    const client = track(createAppQueryClient(createPersister({ buster: 'v1' })));
    expect(client.getDefaultOptions().queries?.gcTime).toBe(10 * 60_000);
    expect(persistOptions(false)).toEqual({ meta: { persist: false } });
    expect(persistOptions(true)).toEqual({
      meta: { persist: true },
      gcTime: 7 * 24 * 60 * 60 * 1000,
    });
  });
});
