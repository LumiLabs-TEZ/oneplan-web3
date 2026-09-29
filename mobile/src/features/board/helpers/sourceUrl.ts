/** Extract a supported web URL from a native share's text, never a lookalike host. */
export function extractionUrl(text: string): string | null {
  for (const candidate of text.match(/https?:\/\/[^\s<>"']+/gi) ?? []) {
    try {
      const url = new URL(candidate.replace(/[),.!?]+$/, ''));
      const host = url.hostname.toLowerCase();
      if (url.username || url.password || url.port || url.href.length > 4096) continue;
      if (
        [
          'tiktok.com',
          'www.tiktok.com',
          'm.tiktok.com',
          'vm.tiktok.com',
          'vt.tiktok.com',
          'instagram.com',
          'www.instagram.com',
          'm.instagram.com',
        ].includes(host)
      ) {
        if (url.pathname === '/') continue;
        return url.href;
      }
    } catch {
      /* malformed share text */
    }
  }
  return null;
}
