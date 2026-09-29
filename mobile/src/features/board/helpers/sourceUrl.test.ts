import { extractionUrl } from './sourceUrl';
it('extracts TikTok/Instagram URLs from shared text', () => {
  expect(extractionUrl('Watch this! https://vm.tiktok.com/abc/')).toBe(
    'https://vm.tiktok.com/abc/',
  );
  expect(extractionUrl('https://www.instagram.com/reel/abc/?utm_source=x')).toContain('/reel/abc/');
});
it.each([
  'https://tiktok.com.evil.test/video/1',
  'https://eviltiktok.com/video/1',
  'https://user@tiktok.com/video/1',
  'file://tiktok.com/video/1',
  'javascript:alert(1)',
  'https://tiktok.com/',
  'https://tiktok.com:9000/video/1',
])('rejects unsafe input %s', (text) => expect(extractionUrl(text)).toBeNull());
