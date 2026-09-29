import { createApiClient } from '@/api/client';
import { newSaveProgress, saveDocument } from './save';
import type { Document } from './state';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
it('retains draft, item IDs and successful uploads across a partial upload failure; publishes last', async () => {
  const requests: string[] = [];
  const api = createApiClient('http://x', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    const path = new URL(req.url).pathname;
    requests.push(`${req.method} ${path}`);
    if (path.endsWith('/draft')) return json({ id: 10 }, 201);
    if (path.endsWith('/items')) return json({ id: 20 }, 201);
    return json({ id: 10 });
  }) as typeof fetch);
  const doc: Document = {
    fields: { name: 'Trip', countryId: 1 },
    coverUri: 'file://cover',
    activities: [{ key: 'new', title: 'Visit', dayNumber: 1, imageUrls: ['file://a', 'file://b'] }],
  };
  let fail = true;
  const upload = jest.fn(async ({ uri }: { uri: string }) => {
    if (uri === 'file://b' && fail) {
      fail = false;
      throw new Error('failed');
    }
    return { url: `https://signed/${uri}`, objectKey: `key/${uri}` };
  });
  const progress = newSaveProgress();
  await expect(saveDocument(doc, progress, true, { api, upload })).rejects.toThrow('failed');
  expect(progress.listingId).toBe(10);
  expect(progress.itemIds.new).toBe(20);
  expect(requests.some((r) => r.endsWith('/publish'))).toBe(false);
  await saveDocument(doc, progress, true, { api, upload });
  expect(requests.filter((r) => r.endsWith('/draft'))).toHaveLength(1);
  expect(requests.filter((r) => r === 'POST /marketplace/listings/10/items')).toHaveLength(1);
  expect(upload.mock.calls.filter(([a]) => a.uri === 'file://cover')).toHaveLength(1);
  expect(upload.mock.calls.filter(([a]) => a.uri === 'file://a')).toHaveLength(1);
  expect(requests.at(-1)).toBe('POST /marketplace/listings/10/publish');
});
it('preserves remote images without uploading them', async () => {
  const api = createApiClient('http://x', (async () => json({ id: 10 })) as typeof fetch);
  const upload = jest.fn();
  await saveDocument(
    {
      fields: { name: 'Trip', countryId: 1, coverImageUrl: 'https://cover' },
      activities: [
        { key: '20', id: 20, title: 'Visit', dayNumber: 1, imageUrls: ['https://image'] },
      ],
    },
    newSaveProgress(10),
    false,
    { api, upload },
  );
  expect(upload).not.toHaveBeenCalled();
});

it('does not patch unchanged listing fields or unchanged images on save', async () => {
  const calls: string[] = [];
  const api = createApiClient('http://x', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push(request.method);
    return json({ id: 10 });
  }) as typeof fetch);
  const doc: Document = {
    fields: { name: 'Trip', countryId: 1, coverImageUrl: 'https://cover' },
    activities: [],
  };
  const progress = newSaveProgress(10);
  progress.savedFields = doc.fields;
  await saveDocument(doc, progress, false, { api, upload: jest.fn() });
  expect(calls).toEqual([]);
});

it.each([
  [
    { countryId: 1, cityId: null, stateId: 5 },
    { cityId: null, stateId: 5 },
  ],
  [
    { countryId: 2, cityId: null, stateId: null },
    { countryId: 2, cityId: null, stateId: null },
  ],
  [{ countryId: 1 }, {}],
  [
    { countryId: 1, cityId: 20, stateId: 6 },
    { cityId: 20, stateId: 6 },
  ],
])('preserves omission and sends explicit destination clears: %j', async (fields, expected) => {
  const bodies: unknown[] = [];
  const api = createApiClient('http://x', (async (input: RequestInfo | URL, init?: RequestInit) => {
    const req = new Request(input, init);
    if (req.method === 'PATCH') bodies.push(await req.json());
    return json({ id: 10 });
  }) as typeof fetch);
  const progress = newSaveProgress(10);
  progress.savedFields = { name: 'Trip', countryId: 1, cityId: 10, stateId: 4 };
  await saveDocument({ fields: { name: 'Trip', ...fields }, activities: [] }, progress, false, {
    api,
  });
  expect(bodies).toEqual(Object.keys(expected).length ? [expected] : []);
});
