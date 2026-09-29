/** @jest-environment node */
import { createApiClient } from '@/api/client';
import { ApiMutationError } from '@/api/mutationError';
import { createBoard, addPins, generateTrip, deleteBoard, startExtraction } from './mutations';
import { claimRewardedCredit, reportAppLaunch } from './credits';
import { fetchBoards, fetchQuota } from './queries';
jest.mock('@/api/headers', () => ({ buildHeaders: () => ({}) }));
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
it('uses the existing Board contract for creation, saving pins, generation, and deletion', async () => {
  const calls: { path: string; method: string; body: unknown }[] = [];
  const api = createApiClient('https://api.test', async (input) => {
    const req = input as Request;
    calls.push({
      path: new URL(req.url).pathname,
      method: req.method,
      body: req.method === 'DELETE' ? null : await req.json(),
    });
    return req.method === 'DELETE' ? new Response(null, { status: 204 }) : json({ id: 2 });
  });
  await createBoard({ title: 'Tokyo', countryId: 4 }, api);
  await addPins(2, [{ name: 'Cafe', dayNumber: 2, timeOfDayText: 'morning' }], api);
  await generateTrip(2, { pinIds: [5], tripName: 'Weekend', dayCount: 2, fillGaps: false }, api);
  await deleteBoard(2, api);
  expect(calls.map((c) => c.path)).toEqual([
    '/board',
    '/board/2/pins',
    '/board/2/generate-trip',
    '/board/2',
  ]);
  expect(calls[1]?.body).toEqual({
    pins: [{ name: 'Cafe', dayNumber: 2, timeOfDayText: 'morning' }],
  });
  expect(calls[2]?.body).toMatchObject({ fillGaps: false });
});
it('preserves structured 402/409 and does not coerce read failures to empty boards', async () => {
  const api = createApiClient('https://api.test', async () =>
    json({ code: 'insufficient_scan_credits', available: 0 }, 402),
  );
  await expect(startExtraction('https://vm.tiktok.com/a', api)).rejects.toMatchObject({
    status: 402,
    body: { available: 0 },
  });
  await expect(fetchBoards(api)).rejects.toMatchObject({ status: 402 });
  await expect(fetchQuota(api)).rejects.toMatchObject({ status: 402 });
});
it('retries a rewarded grant once with the same key', async () => {
  const keys: string[] = [];
  const api = createApiClient('https://api.test', async (input) => {
    const req = input as Request;
    keys.push((await req.json()).adKey);
    return keys.length === 1
      ? json({}, 503)
      : json({ granted: true, available: 1, remainingToday: 2 });
  });
  expect(await claimRewardedCredit('one-ad-view', api)).toMatchObject({ granted: true });
  expect(keys).toEqual(['one-ad-view', 'one-ad-view']);
});
it('does not retry validation failures or daily-cap responses', async () => {
  const fail = jest.fn(async () => json({}, 400));
  await expect(
    claimRewardedCredit('invalid', createApiClient('https://api.test', fail)),
  ).rejects.toBeInstanceOf(ApiMutationError);
  expect(fail).toHaveBeenCalledTimes(1);
  const capped = jest.fn(async () => json({ granted: false, available: 0, remainingToday: 0 }));
  expect(
    await claimRewardedCredit('valid', createApiClient('https://api.test', capped)),
  ).toMatchObject({ granted: false });
  expect(capped).toHaveBeenCalledTimes(1);
});
it('reports the installed version, without making the caller infer a grant', async () => {
  const api = createApiClient('https://api.test', async (input) => {
    expect(await (input as Request).json()).toEqual({ appVersion: '1.5.0' });
    return json({ available: 3 });
  });
  expect(await reportAppLaunch('1.5.0', api)).toEqual({ available: 3 });
});
