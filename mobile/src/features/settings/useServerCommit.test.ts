import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { fetchServerCommitHash, useServerCommit } from './useServerCommit';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('fetchServerCommitHash', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns the commit hash on a 200 response', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ commitHash: 'c8057b18abcdef' }), { status: 200 }),
      );
    await expect(fetchServerCommitHash()).resolves.toBe('c8057b18abcdef');
  });

  it('returns null on a non-2xx response', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    await expect(fetchServerCommitHash()).resolves.toBeNull();
  });

  it('returns null when the request throws', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    await expect(fetchServerCommitHash()).resolves.toBeNull();
  });
});

describe('useServerCommit', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('resolves to the short commit hash', async () => {
    let resolve!: (response: Response) => void;
    jest.spyOn(global, 'fetch').mockReturnValue(
      new Promise<Response>((done) => {
        resolve = done;
      }),
    );
    const { result } = await renderHook(() => useServerCommit(), { wrapper });
    expect(result.current).toBe('--');
    await act(async () => {
      resolve(new Response(JSON.stringify({ commitHash: 'c8057b18abcdef' }), { status: 200 }));
    });
    await waitFor(() => expect(result.current).toBe('c8057b1'));
  });

  it('stays "--" on failure', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));
    const { result } = await renderHook(() => useServerCommit(), { wrapper });
    await waitFor(() => expect(result.current).toBe('--'));
  });
});
