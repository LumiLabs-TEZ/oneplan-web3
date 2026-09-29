/** @jest-environment node */
import { createApiClient } from '@/api/client';

import { ApiMutationError } from '@/api/mutationError';

import { updateProfile, uploadAvatar } from './mutations';

function fakeFetch(handler: (req: Request) => Response | Promise<Response>): typeof fetch {
  return ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('updateProfile', () => {
  it('PATCHes /auth/me with the body and returns the profile', async () => {
    const calls: Request[] = [];
    const api = createApiClient(
      'http://x',
      fakeFetch((req) => {
        calls.push(req);
        return json({ id: 1, displayName: 'Ken', isPro: false, providers: [], isAdmin: false });
      }),
    );
    const res = await updateProfile({ displayName: 'Ken' }, api);
    expect(res.displayName).toBe('Ken');
    expect(calls[0]?.method).toBe('PATCH');
    expect(new URL(calls[0]!.url).pathname).toBe('/auth/me');
    expect(await calls[0]!.json()).toEqual({ displayName: 'Ken' });
  });

  it('throws ApiMutationError on failure', async () => {
    const api = createApiClient(
      'http://x',
      fakeFetch(() => json({ message: 'Bad name' }, 400)),
    );
    await expect(updateProfile({ displayName: '' }, api)).rejects.toBeInstanceOf(ApiMutationError);
  });
});

describe('uploadAvatar', () => {
  it('calls uploadImage with target user-avatar and the entity id', async () => {
    const uploadImage = jest.fn().mockResolvedValue({ objectKey: 'k', url: 'https://x/k' });
    await uploadAvatar('file://a.jpg', 42, { uploadImage });
    expect(uploadImage).toHaveBeenCalledWith({
      uri: 'file://a.jpg',
      target: 'user-avatar',
      entityId: 42,
    });
  });
});
