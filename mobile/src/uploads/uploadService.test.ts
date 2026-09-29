/** @jest-environment node */
import * as FileSystemLegacy from 'expo-file-system/legacy';

import { createApiClient } from '@/api/client';

import { UploadError, uploadAudio, uploadImage } from './uploadService';

jest.mock('expo-crypto', () => ({ randomUUID: () => 'anon-uuid' }));
jest.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));
jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: { variant: 'dev', apiUrl: 'https://api.test', linkHosts: [] } } },
}));

const BASE = 'https://api.test';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const prepare = jest.fn(async (uri: string) => ({ uri: `${uri}.prepared.jpg` }));

describe('uploadImage', () => {
  beforeEach(() => {
    prepare.mockClear();
  });

  it('runs presign -> put -> confirm and reports progress', async () => {
    const requests: { method: string; path: string; body: unknown }[] = [];
    const api = createApiClient(
      BASE,
      fakeFetch(async (req) => {
        const body = req.method === 'POST' ? await req.clone().json() : undefined;
        requests.push({ method: req.method, path: new URL(req.url).pathname, body });
        if (req.url.endsWith('/uploads/presign')) {
          return json({ uploadUrl: 'https://s3.test/put-url', objectKey: 'obj/1', expiresIn: 60 });
        }
        if (req.url.endsWith('/uploads/confirm')) {
          return json({ url: 'https://s3.test/download', objectKey: 'obj/1' });
        }
        throw new Error(`unexpected request ${req.url}`);
      }),
    );

    const putCalls: { url: string; fileUri: string }[] = [];
    const put = jest.fn(async (url: string, fileUri: string) => {
      putCalls.push({ url, fileUri });
      return 200;
    });

    const progress: number[] = [];
    const result = await uploadImage(
      {
        uri: 'file:///photo.jpg',
        target: 'trip-cover',
        entityId: 7,
        onProgress: (p) => progress.push(p),
      },
      { api, put, prepare },
    );

    expect(result).toEqual({ url: 'https://s3.test/download', objectKey: 'obj/1' });
    expect(prepare).toHaveBeenCalledWith('file:///photo.jpg');

    expect(requests[0]).toMatchObject({
      method: 'POST',
      path: '/uploads/presign',
      body: { target: 'trip-cover', entityId: 7, contentType: 'image/jpeg' },
    });

    expect(putCalls).toEqual([
      { url: 'https://s3.test/put-url', fileUri: 'file:///photo.jpg.prepared.jpg' },
    ]);

    expect(requests[1]).toMatchObject({
      method: 'POST',
      path: '/uploads/confirm',
      body: { target: 'trip-cover', entityId: 7, objectKey: 'obj/1' },
    });

    expect(progress).toEqual([0.1, 0.2, 0.8, 1]);
  });

  it('throws s3UploadFailed on a non-2xx PUT and never calls confirm', async () => {
    const requests: string[] = [];
    const api = createApiClient(
      BASE,
      fakeFetch(async (req) => {
        requests.push(new URL(req.url).pathname);
        if (req.url.endsWith('/uploads/presign')) {
          return json({ uploadUrl: 'https://s3.test/put-url', objectKey: 'obj/1', expiresIn: 60 });
        }
        throw new Error(`unexpected request ${req.url}`);
      }),
    );
    const put = jest.fn(async () => 403);

    await expect(
      uploadImage(
        { uri: 'file:///photo.jpg', target: 'trip-cover', entityId: 7 },
        { api, put, prepare },
      ),
    ).rejects.toMatchObject({ code: 's3UploadFailed' });

    expect(requests).toEqual(['/uploads/presign']);
  });

  it('passes caption through to confirm', async () => {
    const api = createApiClient(
      BASE,
      fakeFetch(async (req) => {
        if (req.url.endsWith('/uploads/presign')) {
          return json({ uploadUrl: 'https://s3.test/put-url', objectKey: 'obj/2', expiresIn: 60 });
        }
        if (req.url.endsWith('/uploads/confirm')) {
          const body = await req.clone().json();
          expect(body.caption).toBe('Sunset');
          return json({ url: 'https://s3.test/download', objectKey: 'obj/2' });
        }
        throw new Error(`unexpected request ${req.url}`);
      }),
    );
    const put = jest.fn(async () => 200);
    await uploadImage(
      { uri: 'file:///p.jpg', target: 'trip-photo', entityId: 9, caption: 'Sunset' },
      { api, put, prepare },
    );
  });
});

describe('UploadError', () => {
  it('carries a stable code', () => {
    const err = new UploadError('confirmFailed');
    expect(err.code).toBe('confirmFailed');
    expect(err.name).toBe('UploadError');
  });
});

describe('defaultPut fallback', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    (FileSystemLegacy.uploadAsync as jest.Mock).mockClear();
  });

  it('PUTs via expo-file-system/legacy uploadAsync with the signed Content-Type', async () => {
    // A blob fetch would send an empty-type body and 403 on GCS signed URLs; it must not be used
    // while uploadAsync works.
    global.fetch = jest.fn(async () => {
      throw new Error('blob fetch must not run');
    }) as unknown as typeof fetch;

    const api = createApiClient(
      BASE,
      fakeFetch(async (req) => {
        if (req.url.endsWith('/uploads/presign')) {
          return json({ uploadUrl: 'https://s3.test/put-url', objectKey: 'obj/3', expiresIn: 60 });
        }
        if (req.url.endsWith('/uploads/confirm')) {
          return json({ url: 'https://s3.test/download', objectKey: 'obj/3' });
        }
        throw new Error(`unexpected request ${req.url}`);
      }),
    );

    const result = await uploadImage(
      { uri: 'file:///photo.jpg', target: 'trip-cover', entityId: 7 },
      { api, prepare },
    );

    expect(result).toEqual({ url: 'https://s3.test/download', objectKey: 'obj/3' });
    expect(FileSystemLegacy.uploadAsync).toHaveBeenCalledWith(
      'https://s3.test/put-url',
      'file:///photo.jpg.prepared.jpg',
      expect.objectContaining({ httpMethod: 'PUT', headers: { 'Content-Type': 'image/jpeg' } }),
    );
  });

  it('falls back to a blob fetch PUT when uploadAsync throws', async () => {
    (FileSystemLegacy.uploadAsync as jest.Mock).mockRejectedValueOnce(new Error('native down'));
    const puts: { url: string; contentType: string | undefined }[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith('file://')) return { blob: async () => new Blob(['x']) } as Response;
      puts.push({ url, contentType: (init?.headers as Record<string, string>)['Content-Type'] });
      return { status: 200 } as Response;
    }) as unknown as typeof fetch;

    const api = createApiClient(
      BASE,
      fakeFetch(async (req) => {
        if (req.url.endsWith('/uploads/presign')) {
          return json({ uploadUrl: 'https://s3.test/put-url', objectKey: 'obj/4', expiresIn: 60 });
        }
        if (req.url.endsWith('/uploads/confirm')) {
          return json({ url: 'https://s3.test/download', objectKey: 'obj/4' });
        }
        throw new Error(`unexpected request ${req.url}`);
      }),
    );

    await uploadImage(
      { uri: 'file:///photo.jpg', target: 'trip-cover', entityId: 7 },
      { api, prepare },
    );
    expect(puts).toEqual([{ url: 'https://s3.test/put-url', contentType: 'image/jpeg' }]);
  });
});

describe('uploadAudio', () => {
  it('runs presign -> put -> confirm with audio/mp4 content type and reports progress', async () => {
    const requests: { method: string; path: string; body: unknown }[] = [];
    const api = createApiClient(
      BASE,
      fakeFetch(async (req) => {
        const body = req.method === 'POST' ? await req.clone().json() : undefined;
        requests.push({ method: req.method, path: new URL(req.url).pathname, body });
        if (req.url.endsWith('/uploads/presign')) {
          return json({
            uploadUrl: 'https://s3.test/voice-url',
            objectKey: 'voice/1',
            expiresIn: 60,
          });
        }
        if (req.url.endsWith('/uploads/confirm')) {
          return json({ url: 'https://s3.test/download', objectKey: 'voice/1' });
        }
        throw new Error(`unexpected request ${req.url}`);
      }),
    );

    const putCalls: { url: string; fileUri: string; contentType?: string }[] = [];
    const put = jest.fn(async (url: string, fileUri: string, contentType?: string) => {
      putCalls.push({ url, fileUri, contentType });
      return 200;
    });

    const progress: number[] = [];
    const result = await uploadAudio(
      { uri: 'file:///voice.m4a', tripId: 7, onProgress: (p) => progress.push(p) },
      { api, put },
    );

    expect(result).toEqual({ objectKey: 'voice/1' });

    expect(requests[0]).toMatchObject({
      method: 'POST',
      path: '/uploads/presign',
      body: {
        target: 'plan-item-voice',
        entityId: 7,
        contentType: 'audio/mp4',
        filename: 'voice.m4a',
      },
    });

    expect(putCalls).toEqual([
      { url: 'https://s3.test/voice-url', fileUri: 'file:///voice.m4a', contentType: 'audio/mp4' },
    ]);

    expect(requests[1]).toMatchObject({
      method: 'POST',
      path: '/uploads/confirm',
      body: { target: 'plan-item-voice', entityId: 7, objectKey: 'voice/1' },
    });

    expect(progress).toEqual([0.2, 0.8, 1]);
  });

  it('throws s3UploadFailed on a 500 PUT and never calls confirm', async () => {
    const requests: string[] = [];
    const api = createApiClient(
      BASE,
      fakeFetch(async (req) => {
        requests.push(new URL(req.url).pathname);
        if (req.url.endsWith('/uploads/presign')) {
          return json({
            uploadUrl: 'https://s3.test/voice-url',
            objectKey: 'voice/1',
            expiresIn: 60,
          });
        }
        throw new Error(`unexpected request ${req.url}`);
      }),
    );
    const put = jest.fn(async () => 500);

    await expect(
      uploadAudio({ uri: 'file:///voice.m4a', tripId: 7 }, { api, put }),
    ).rejects.toMatchObject({ code: 's3UploadFailed' });

    expect(requests).toEqual(['/uploads/presign']);
  });
});
