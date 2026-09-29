/**
 * Passport-card share orchestration — port of `PassportView.handleShare`. Captures the off-screen
 * `PassportRenderHost` (`variant="render"`, mounted by the caller and referenced via `renderRef`)
 * to a PNG, then dispatches by `PassportShareKind`: IG Stories / Message fall back to the system
 * share sheet when unavailable (both `'unavailable'` results, mirroring the iOS
 * `ActivityShareSheet` fallback); Photos alerts success/denied/failure.
 *
 * Deliberately NOT gated on connectivity: capture, save-to-Photos, Message and the system share
 * sheet are all local operations, so the passport stays shareable offline (the card itself is
 * rendered from already-fetched data). There is no network call in this flow to guard.
 */
import { useCallback, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, type View } from 'react-native';

import type { PassportShareKind } from '@/features/passport/components/PassportShareRow';
import { useAppLanguage } from '@/i18n';
import {
  captureView,
  saveImageToPhotos,
  shareImageViaMessage,
  shareToInstagramStories,
  systemShare,
} from '@/native/share';

export interface UsePassportShareResult {
  share: (kind: PassportShareKind) => Promise<void>;
  busy: boolean;
  message: string | null;
}

export function usePassportShare(renderRef: RefObject<View | null>): UsePassportShareResult {
  useAppLanguage();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const share = useCallback(
    async (kind: PassportShareKind) => {
      setBusy(true);
      setMessage(null);
      try {
        // Only the capture maps to the render-error copy; anything further down is unexpected.
        let uri: string;
        try {
          uri = await captureView(renderRef, { width: 360, pixelRatio: 3 });
        } catch {
          const renderError = t('Could not render the passport image');
          setMessage(renderError);
          Alert.alert(renderError);
          return;
        }

        if (kind === 'instagram') {
          const result = await shareToInstagramStories(uri);
          if (result === 'unavailable') await systemShare(uri);
          return;
        }

        if (kind === 'message') {
          const result = await shareImageViaMessage(uri);
          if (result === 'unavailable') await systemShare(uri);
          return;
        }

        const result = await saveImageToPhotos(uri);
        const alertMessage =
          result === 'saved'
            ? t('Saved to Photos')
            : result === 'denied'
              ? t('Allow photo library access in Settings to save your passport')
              : t('Something went wrong');
        setMessage(alertMessage);
        Alert.alert(alertMessage);
      } catch {
        // Never `t(err.message)` — a raw native error message is not an i18n key.
        const generic = t('Something went wrong');
        setMessage(generic);
        Alert.alert(generic);
      } finally {
        setBusy(false);
      }
    },
    [renderRef, t],
  );

  return { share, busy, message };
}
