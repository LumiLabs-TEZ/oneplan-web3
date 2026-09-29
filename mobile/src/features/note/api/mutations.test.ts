import { createTestQueryClient } from '@/testSupport/queryClient';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import React from 'react';

import { createApiClient } from '@/api/client';
import { keys } from '@/api/keys';
import { ApiMutationError } from '@/api/mutationError';

import {
  createTripNote,
  deleteTripNote,
  updateTripNote,
  useCreateNote,
  useDeleteNote,
  useUpdateNote,
} from './mutations';
import type { TripNoteDto } from '../types';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function makeWrapper(qc: QueryClient) {
  function Wrapper({ children }: { children: ReactNode }) {
    return React.createElement(QueryClientProvider, { client: qc }, children);
  }
  return Wrapper;
}

const note = (id: number, title: string): TripNoteDto => ({
  id,
  tripId: 5,
  createdById: 1,
  title,
  body: null,
  isDone: false,
  createdAt: '2026-09-16T00:00:00.000Z',
  updatedAt: '2026-09-16T00:00:00.000Z',
});

describe('trip note mutation fns', () => {
  it('POSTs the create body and returns the note (201)', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(note(9, 'Packing'), 201);
      }),
    );
    const res = await createTripNote(5, { title: 'Packing', isDone: false }, api);
    expect(res.id).toBe(9);
    expect(calls[0]?.method).toBe('POST');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/notes');
  });

  it('PATCHes the note path and returns the body', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json(note(7, 'Updated'));
      }),
    );
    const res = await updateTripNote(5, 7, { title: 'Updated' }, api);
    expect(res.title).toBe('Updated');
    expect(calls[0]?.method).toBe('PATCH');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/notes/7');
  });

  it('DELETEs the note path', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return new Response(null, { status: 204 });
      }),
    );
    await deleteTripNote(5, 7, api);
    expect(calls[0]?.method).toBe('DELETE');
    expect(new URL(calls[0]!.url).pathname).toBe('/trips/5/notes/7');
  });

  it('throws ApiMutationError on a 400', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Bad request' }, 400)),
    );
    await expect(createTripNote(5, { title: '', isDone: false }, api)).rejects.toBeInstanceOf(
      ApiMutationError,
    );
  });
});

describe('useCreateNote', () => {
  it('inserts the created note at index 0', async () => {
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    qc.setQueryData(keys.trips.notes(5), [note(1, 'Existing')]);
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json(note(2, 'New note'), 201)),
    );
    const { result } = await renderHook(() => useCreateNote(5, api), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ title: 'New note', isDone: false });
    });

    expect(qc.getQueryData<TripNoteDto[]>(keys.trips.notes(5))?.map((n) => n.id)).toEqual([2, 1]);
  });
});

describe('useUpdateNote', () => {
  it('writes the returned row back in place', async () => {
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    qc.setQueryData(keys.trips.notes(5), [note(1, 'A'), note(2, 'B'), note(3, 'C')]);
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json(note(2, 'B updated'))),
    );
    const { result } = await renderHook(() => useUpdateNote(5, api), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync({ id: 2, body: { title: 'B updated' } });
    });

    const titles = qc.getQueryData<TripNoteDto[]>(keys.trips.notes(5))?.map((n) => n.title);
    expect(titles).toEqual(['A', 'B updated', 'C']);
  });
});

describe('useDeleteNote', () => {
  it('optimistically removes the note before the request resolves', async () => {
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    qc.setQueryData(keys.trips.notes(5), [note(1, 'A'), note(2, 'B')]);
    const api = createApiClient(
      'http://x',
      fakeFetch(() => new Response(null, { status: 204 })),
    );
    const { result } = await renderHook(() => useDeleteNote(5, api), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(qc.getQueryData<TripNoteDto[]>(keys.trips.notes(5))?.map((n) => n.id)).toEqual([2]);
  });

  it('restores the previous list when the delete fails', async () => {
    const qc = createTestQueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    qc.setQueryData(keys.trips.notes(5), [note(1, 'A'), note(2, 'B')]);
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Forbidden' }, 403)),
    );
    const { result } = await renderHook(() => useDeleteNote(5, api), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await expect(result.current.mutateAsync(1)).rejects.toBeInstanceOf(ApiMutationError);
    });

    expect(qc.getQueryData<TripNoteDto[]>(keys.trips.notes(5))?.map((n) => n.id)).toEqual([1, 2]);
  });
});
