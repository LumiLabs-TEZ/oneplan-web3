import { checkIosStoreVersion, compareVersions, isUpdateRequired } from './versionGate';

const lookup = (body: unknown, ok = true) =>
  (async () =>
    new Response(JSON.stringify(body), { status: ok ? 200 : 500 })) as unknown as typeof fetch;

describe('compareVersions / isUpdateRequired', () => {
  it.each([
    ['1.4.9', '1.5.0', -1],
    ['1.10', '1.9', 1],
    ['1.5.0', '1.5', 0],
    ['2.0.0', '1.99.99', 1],
    ['1.5.0', '1.5.0', 0],
  ])('%s vs %s → %i', (a, b, expected) => {
    expect(compareVersions(a, b)).toBe(expected);
  });

  it('gates only when strictly behind; malformed never gates', () => {
    expect(isUpdateRequired('1.4.9', '1.5.0')).toBe(true);
    expect(isUpdateRequired('1.5.0', '1.5.0')).toBe(false);
    expect(isUpdateRequired('1.6.0', '1.5.0')).toBe(false);
    expect(isUpdateRequired('abc', '1.5.0')).toBe(false);
  });
});

describe('checkIosStoreVersion', () => {
  it('returns store info when behind, stripping the URL query', async () => {
    const info = await checkIosStoreVersion(
      'lumilabs.oneplan',
      '1.4.9',
      lookup({
        results: [{ version: '1.5.0', trackViewUrl: 'https://apps.apple.com/app/id1?uo=4' }],
      }),
    );
    expect(info).toEqual({
      currentVersion: '1.4.9',
      availableVersion: '1.5.0',
      storeUrl: 'https://apps.apple.com/app/id1',
      platform: 'ios',
    });
  });

  it('fails open on equal version, empty results, HTTP error and thrown fetch', async () => {
    const eq = lookup({ results: [{ version: '1.4.9', trackViewUrl: 'https://x' }] });
    expect(await checkIosStoreVersion('b', '1.4.9', eq)).toBeNull();
    expect(await checkIosStoreVersion('b', '1.4.9', lookup({ results: [] }))).toBeNull();
    expect(await checkIosStoreVersion('b', '1.4.9', lookup({}, false))).toBeNull();
    const boom = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await checkIosStoreVersion('b', '1.4.9', boom)).toBeNull();
  });
});
