import { useEffect, useRef } from 'react';
import { useShareIntentContext } from 'expo-share-intent';
import { extractionUrl } from '@/features/board/helpers/sourceUrl';
import { pendingLinkStore } from '@/links/pendingLinkStore';
/** Consume at the shell, including before login; the existing resolver owns auth-gated navigation. */
export function useExtractionShare() {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  const consumed = useRef<string | null>(null);
  useEffect(() => {
    if (!hasShareIntent) {
      consumed.current = null;
      return;
    }
    const raw = shareIntent.webUrl || shareIntent.text || '';
    if (consumed.current === raw) return;
    consumed.current = raw;
    const sourceUrl = extractionUrl(raw);
    pendingLinkStore.set(sourceUrl ? { kind: 'pinExtractUrl', sourceUrl } : { kind: 'board' });
    resetShareIntent();
  }, [hasShareIntent, shareIntent.webUrl, shareIntent.text, resetShareIntent]);
}
