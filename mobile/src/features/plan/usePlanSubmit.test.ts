import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import React from 'react';

import { createApiClient } from '@/api/client';

import { usePlanSubmit } from './usePlanSubmit';
import { seedCreate, seedEdit } from './planForm';
import type { PlanItemDto } from './types';

jest.mock('expo-router', () => ({ router: { back: jest.fn() } }));

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

const planItem = (over: Partial<PlanItemDto> = {}): PlanItemDto => ({
  id: 42,
  tripId: 5,
  title: 'Beach',
  imageUrls: ['existing.jpg'],
  sortOrder: 0,
  createdAt: '2026-09-16T00:00:00.000Z',
  members: [{ id: 1, userId: 1, displayName: 'A' }],
  dayNumber: 1,
  startTime: '09:00',
  ...over,
});

describe('usePlanSubmit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('uploads images then audio, in order, before creating the item', async () => {
    const calls: string[] = [];
    const uploadImage = jest.fn(async ({ uri }: { uri: string }) => {
      calls.push(`image:${uri}`);
      return { url: 'u', objectKey: `key-${uri}` };
    });
    const uploadAudio = jest.fn(async ({ uri }: { uri: string }) => {
      calls.push(`audio:${uri}`);
      return { objectKey: `voice-${uri}` };
    });

    const requests: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        requests.push(req);
        return json(planItem({ id: 9 }), 201);
      }),
    );

    const qc = new QueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const { result } = await renderHook(() => usePlanSubmit(5, { uploadImage, uploadAudio, api }), {
      wrapper: makeWrapper(qc),
    });

    const state = {
      ...seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [1, 2],
      }),
      name: 'Beach day',
      newImageUris: ['a.jpg', 'b.jpg'],
      voice: { kind: 'new' as const, uri: 'rec.m4a', durationSec: 12 },
    };

    let success = false;
    await act(async () => {
      success = await result.current.submit(state, [1, 2]);
    });

    expect(success).toBe(true);
    expect(calls).toEqual(['image:a.jpg', 'image:b.jpg', 'audio:rec.m4a']);
    expect(uploadImage).toHaveBeenCalledWith({
      uri: 'a.jpg',
      target: 'plan-item-image',
      entityId: 5,
    });
    expect(uploadAudio).toHaveBeenCalledWith({ uri: 'rec.m4a', tripId: 5 });

    const body = await requests[0]!.json();
    expect(body).toMatchObject({
      title: 'Beach day',
      imageUrls: ['key-a.jpg', 'key-b.jpg'],
      voiceUrl: 'voice-rec.m4a',
      voiceDuration: 12,
    });
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(result.current.pending).toBe(false);
    expect(result.current.error).toBeNull();
    expect(Haptics.notificationAsync).toHaveBeenCalledWith(
      Haptics.NotificationFeedbackType.Success,
    );
  });

  it('updates via PATCH with the item id, keeping existing images', async () => {
    const requests: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        requests.push(req);
        return json(planItem({ id: 42, title: 'Updated' }));
      }),
    );
    const qc = new QueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const { result } = await renderHook(() => usePlanSubmit(5, { api }), {
      wrapper: makeWrapper(qc),
    });

    const state = seedEdit(planItem(), {
      isPlanningMode: true,
      tripStartDate: null,
      acceptedIds: [1],
    });

    let success = false;
    await act(async () => {
      success = await result.current.submit(state, [1]);
    });

    expect(success).toBe(true);
    expect(requests[0]?.method).toBe('PATCH');
    expect(new URL(requests[0]!.url).pathname).toBe('/trips/5/plan-items/42');
    const body = await requests[0]!.json();
    expect(body.imageUrls).toEqual(['existing.jpg']);
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('sets a photo-upload error and never calls create when an image upload fails', async () => {
    const uploadImage = jest.fn(async () => {
      throw new Error('boom');
    });
    const uploadAudio = jest.fn();
    const requests: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        requests.push(req);
        return json(planItem(), 201);
      }),
    );
    const qc = new QueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const { result } = await renderHook(() => usePlanSubmit(5, { uploadImage, uploadAudio, api }), {
      wrapper: makeWrapper(qc),
    });

    const state = {
      ...seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [1],
      }),
      name: 'x',
      newImageUris: ['a.jpg'],
    };

    let success = true;
    await act(async () => {
      success = await result.current.submit(state, [1]);
    });

    expect(success).toBe(false);
    expect(requests).toHaveLength(0);
    expect(uploadAudio).not.toHaveBeenCalled();
    expect(result.current.error).toBe(
      'Photo upload failed. Please check your connection and try again.',
    );
    expect(router.back).not.toHaveBeenCalled();
  });

  it('surfaces a mutation error message when the create request fails', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Forbidden' }, 403)),
    );
    const qc = new QueryClient({ defaultOptions: { mutations: { gcTime: 0 } } });
    const { result } = await renderHook(() => usePlanSubmit(5, { api }), {
      wrapper: makeWrapper(qc),
    });

    const state = {
      ...seedCreate({
        isPlanningMode: true,
        tripStartDate: null,
        day: 1,
        date: null,
        acceptedIds: [1],
      }),
      name: 'x',
    };

    let success = true;
    await act(async () => {
      success = await result.current.submit(state, [1]);
    });

    expect(success).toBe(false);
    expect(result.current.error).toBeTruthy();
    expect(router.back).not.toHaveBeenCalled();
  });
});
