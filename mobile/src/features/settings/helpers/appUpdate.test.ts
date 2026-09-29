import type { TFunction } from 'i18next';

import { isUpdateBusy, updateBuildLabel, updateStatusLabel } from './appUpdate';

const t = ((key: string) => key) as unknown as TFunction;

describe('updateStatusLabel', () => {
  it('is empty while idle', () => {
    expect(updateStatusLabel('idle', t)).toBeUndefined();
  });

  it.each([
    ['checking', 'Checking…'],
    ['downloading', 'Downloading…'],
    ['upToDate', 'Up to date'],
    ['restarting', 'Restarting…'],
    ['unavailable', 'Not available'],
    ['error', 'Failed'],
  ] as const)('%s → %s', (status, label) => {
    expect(updateStatusLabel(status, t)).toBe(label);
  });
});

describe('isUpdateBusy', () => {
  it('is true only while work is in flight', () => {
    expect(isUpdateBusy('checking')).toBe(true);
    expect(isUpdateBusy('downloading')).toBe(true);
    expect(isUpdateBusy('restarting')).toBe(true);
    expect(isUpdateBusy('upToDate')).toBe(false);
    expect(isUpdateBusy('error')).toBe(false);
  });
});

describe('updateBuildLabel', () => {
  it('shows the short update id for an OTA bundle', () => {
    expect(
      updateBuildLabel({ isEmbeddedLaunch: false, updateId: '01a0dd02-37bc-7e17', channel: 'dev' }),
    ).toBe('dev · 01a0dd0');
  });

  it('shows embedded for the binary bundle', () => {
    expect(updateBuildLabel({ isEmbeddedLaunch: true, updateId: 'abc', channel: 'dev' })).toBe(
      'dev · embedded',
    );
  });

  it('falls back when channel/id are missing', () => {
    expect(updateBuildLabel({ isEmbeddedLaunch: false, updateId: null, channel: null })).toBe(
      '-- · embedded',
    );
  });
});
