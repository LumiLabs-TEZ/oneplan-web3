import { createApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';
import { createReceiptExpense, scanReceipt } from './mutations';
import fixture from '../fixtures/receipt.json';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
function client(handler: (request: Request) => Response | Promise<Response>) {
  return createApiClient('https://example.test', ((input: RequestInfo | URL, init?: RequestInit) =>
    Promise.resolve(handler(new Request(input, init)))) as typeof fetch);
}
it.each([200, 201])(
  'reads scan response %i and sends a genuine multipart image',
  async (status) => {
    const form = new FormData();
    form.append('image', new Blob(['jpeg'], { type: 'image/jpeg' }), 'receipt.jpg');
    const api = client(async (request) => {
      expect(new URL(request.url).pathname).toBe('/trips/5/receipts/scan');
      expect(request.headers.get('content-type')).toContain('multipart/form-data; boundary=');
      const body = await request.text();
      expect(body).toContain('name="image"');
      expect(body).toContain('filename="receipt.jpg"');
      expect(body).toContain('jpeg');
      return json(fixture.receipt, status);
    });
    expect(await scanReceipt(5, form, api)).toEqual(fixture.receipt);
  },
);
it.each([403, 422, 500])('preserves classified scan errors (%i)', async (status) => {
  await expect(
    scanReceipt(
      5,
      new FormData(),
      client(() => json({ message: 'Scan failed' }, status)),
    ),
  ).rejects.toMatchObject({
    status,
    body: { message: 'Scan failed' },
    classified: expect.any(Object),
  });
});
it('posts receipt JSON and preserves save failure', async () => {
  const body = {
    name: 'Lunch',
    category: 'FOOD' as const,
    expenseDate: '2026-09-18T10:00:00Z',
    items: [{ name: 'Tea', amount: 8, userId: 1 }],
  };
  const api = client(async (request) => {
    expect(new URL(request.url).pathname).toBe('/trips/5/expenses/receipt');
    expect(await request.json()).toEqual(body);
    return json({ id: 9 }, 201);
  });
  expect(await createReceiptExpense(5, body, api)).toMatchObject({ id: 9 });
  await expect(
    createReceiptExpense(
      5,
      body,
      client(() => json({ message: 'Failed' }, 500)),
    ),
  ).rejects.toBeInstanceOf(ApiMutationError);
});
