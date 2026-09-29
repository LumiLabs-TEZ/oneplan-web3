/** @jest-environment node */
import {
  PinExtractionClient,
  extractionEvent,
  type ExtractionTransport,
} from './PinExtractionClient';
import { usePinExtractionStore as store } from './pinExtractionStore';
import { ApiMutationError } from '@/api/mutationError';
import type { ExtractionSession } from '@/features/board/types';
const session = (overrides: Partial<ExtractionSession> = {}): ExtractionSession => ({
  id: 'session-1',
  sourceUrl: 'https://tiktok.com/@a/video/1',
  status: 'RUNNING',
  pins: [],
  pinCount: 0,
  fromCache: false,
  createdAt: '',
  ...overrides,
});
const flush = async () => {
  for (let n = 0; n < 20; n++) await Promise.resolve();
};
function setup() {
  const transport: jest.Mocked<ExtractionTransport> = {
    start: jest.fn().mockResolvedValue('session-1'),
    active: jest.fn().mockResolvedValue(session()),
    snapshot: jest.fn().mockResolvedValue(session()),
    cancel: jest.fn().mockResolvedValue(undefined),
    creditsChanged: jest.fn(),
    stream: jest
      .fn()
      .mockImplementation(
        (_id, signal) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      ),
  };
  return { transport, client: new PinExtractionClient(transport) };
}
beforeEach(() => {
  store.getState().reset();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});
it('decodes envelopes, named events, ignores keepalive and malformed JSON', () => {
  expect(extractionEvent({ event: 'message', data: '{"type":"pin","data":{"index":1}}' })).toEqual({
    type: 'pin',
    data: { index: 1 },
  });
  expect(extractionEvent({ event: 'status', data: '{"phase":"queued"}' })?.type).toBe('status');
  expect(extractionEvent({ event: 'keepalive', data: '{}' })).toBeNull();
  expect(extractionEvent({ event: 'message', data: 'bad' })).toBeNull();
});
it('attaches the 409 session without paying for another start', async () => {
  const { client, transport } = setup();
  transport.start.mockRejectedValue(
    new ApiMutationError(409, { code: 'extraction_in_progress', sessionId: 'existing' }),
  );
  transport.snapshot.mockResolvedValue(session({ id: 'existing', status: 'DONE' }));
  await client.start('url');
  expect(transport.start).toHaveBeenCalledTimes(1);
  expect(transport.snapshot).toHaveBeenCalledWith('existing');
  expect(transport.stream).not.toHaveBeenCalled();
  client.reset();
});
it('exposes structured 402 credits without opening a stream', async () => {
  const { client, transport } = setup();
  const body = { code: 'insufficient_scan_credits', available: 0, canPurchase: false };
  transport.start.mockRejectedValue(new ApiMutationError(402, body));
  await client.start('url');
  expect(store.getState().creditError).toEqual(body);
  expect(transport.stream).not.toHaveBeenCalled();
  client.reset();
});
it('fences a start response after logout', async () => {
  const { client, transport } = setup();
  let finish!: (id: string) => void;
  transport.start.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const pending = client.start('url');
  client.reset();
  finish('late');
  await pending;
  expect(store.getState().session).toBeNull();
  expect(transport.snapshot).not.toHaveBeenCalled();
});
it('preserves deselection and enriched coordinates on replay', () => {
  store.getState().snapshot(
    session({
      pins: [{ index: 0, name: 'Cafe', latitude: 10, longitude: 20, address: 'Verified' }],
    }),
  );
  store.getState().toggle(0);
  store.getState().snapshot(
    session({
      pins: [
        { index: 0, name: 'Cafe' },
        { index: 1, name: 'Park' },
      ],
    }),
  );
  expect(store.getState().selected).toEqual([1]);
  expect(store.getState().session?.pins[0]).toMatchObject({ address: 'Verified', latitude: 10 });
});
it('reconnects a quiet stream after 60 seconds, without POSTing again', async () => {
  const { client, transport } = setup();
  await client.attach('session-1');
  await jest.advanceTimersByTimeAsync(62_100);
  expect(transport.stream).toHaveBeenCalledTimes(2);
  expect(transport.start).not.toHaveBeenCalled();
  client.reset();
  await flush();
});
it('keeps an active stream alive on comments and stops at the ten-minute cap', async () => {
  const { client, transport } = setup();
  let input!: ReadableStreamDefaultController<Uint8Array>;
  transport.stream.mockImplementation(
    async (_id, signal) =>
      ({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            input = controller;
            signal.addEventListener('abort', () => {
              try {
                controller.close();
              } catch {}
            });
          },
        }),
      }) as Response,
  );
  await client.attach('session-1');
  await flush();
  for (let i = 0; i < 59; i++) {
    input.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
    await flush();
    await jest.advanceTimersByTimeAsync(10_000);
  }
  expect(transport.stream).toHaveBeenCalledTimes(1);
  await jest.advanceTimersByTimeAsync(12_100);
  expect(store.getState().error).toBeTruthy();
  client.reset();
});
it('refresh restores terminal pins without a stream; dismissal clears after server success', async () => {
  const { client, transport } = setup();
  transport.active.mockResolvedValue(
    session({ status: 'DONE', pins: [{ index: 0, name: 'Cafe' }] }),
  );
  await client.refresh();
  expect(store.getState().session?.pins).toHaveLength(1);
  expect(transport.stream).not.toHaveBeenCalled();
  await client.cancel();
  expect(transport.cancel).toHaveBeenCalledWith('session-1');
  expect(store.getState().session).toBeNull();
});
