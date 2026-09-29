import { renderHook } from '@testing-library/react-native';
import { useExtractionShare } from './useExtractionShare';
import { pendingLinkStore } from '@/links/pendingLinkStore';
const reset = jest.fn();
const mockShare = {
  hasShareIntent: true,
  shareIntent: { webUrl: 'https://vm.tiktok.com/abc/', text: null as string | null },
  resetShareIntent: reset,
};
jest.mock('expo-share-intent', () => ({ useShareIntentContext: () => mockShare }));
it('parks a supported share once and clears the native payload; rejects unrelated URLs', async () => {
  pendingLinkStore.clear();
  const { rerender, unmount } = await renderHook(() => useExtractionShare());
  expect(pendingLinkStore.consume()).toEqual({
    kind: 'pinExtractUrl',
    sourceUrl: 'https://vm.tiktok.com/abc/',
  });
  expect(reset).toHaveBeenCalledTimes(1);
  await rerender({});
  expect(pendingLinkStore.peek()).toBeNull();
  mockShare.hasShareIntent = false;
  await rerender({});
  mockShare.hasShareIntent = true;
  mockShare.shareIntent.webUrl = 'https://malicious.test/';
  await rerender({});
  expect(pendingLinkStore.peek()).toEqual({ kind: 'board' });
  expect(reset).toHaveBeenCalledTimes(2);
  await unmount();
});
