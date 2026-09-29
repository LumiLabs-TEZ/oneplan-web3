/**
 * Orchestrates a plan-item form submit: upload any newly-picked images, then a newly-recorded
 * voice note, build the create/update wire body from the already-uploaded refs, fire the
 * mutation, invalidate, and navigate back. Port of the upload-then-save sequencing in
 * `PlanFormModel.submit` (`ios/OnePlan/OnePlan/View/Plan/PlanFormModel.swift:320-450`).
 *
 * Images upload before the voice note (whichever the user attaches) so a failed voice upload
 * never discards already-uploaded image keys — the caller re-submits with the same form state
 * and only the failed step redoes work.
 */
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ApiClient } from '@/api/client';
import { mutationErrorMessage } from '@/api/mutationError';
import {
  uploadAudio as uploadAudioDefault,
  uploadImage as uploadImageDefault,
} from '@/uploads/uploadService';

import { useCreatePlanItem, useUpdatePlanItem } from './api/mutations';
import {
  buildCreateBody,
  buildUpdateBody,
  type PlanFormState,
  type UploadedRefs,
} from './planForm';

export interface UsePlanSubmitDeps {
  uploadImage?: typeof uploadImageDefault;
  uploadAudio?: typeof uploadAudioDefault;
  api?: ApiClient;
}

export interface UsePlanSubmitResult {
  /** Resolves `true` on success (already navigated back), `false` on a handled failure — read
   * `error` for the message. */
  submit: (state: PlanFormState, acceptedIds: readonly number[]) => Promise<boolean>;
  pending: boolean;
  error: string | null;
}

export function usePlanSubmit(tripId: number, deps: UsePlanSubmitDeps = {}): UsePlanSubmitResult {
  const { t } = useTranslation();
  const uploadImage = deps.uploadImage ?? uploadImageDefault;
  const uploadAudio = deps.uploadAudio ?? uploadAudioDefault;
  const create = useCreatePlanItem(tripId, deps.api);
  const update = useUpdatePlanItem(tripId, deps.api);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (state: PlanFormState, acceptedIds: readonly number[]): Promise<boolean> => {
    setPending(true);
    setError(null);
    try {
      const imageKeys: string[] = [];
      for (const uri of state.newImageUris) {
        try {
          const result = await uploadImage({ uri, target: 'plan-item-image', entityId: tripId });
          imageKeys.push(result.objectKey);
        } catch {
          setError(t('Photo upload failed. Please check your connection and try again.'));
          return false;
        }
      }

      let voice: UploadedRefs['voice'] = null;
      if (state.voice.kind === 'new') {
        try {
          const result = await uploadAudio({ uri: state.voice.uri, tripId });
          voice = { key: result.objectKey, durationSec: state.voice.durationSec };
        } catch {
          setError(t('Voice upload failed. Please check your connection and try again.'));
          return false;
        }
      }

      const up: UploadedRefs = { imageKeys, voice };

      if (state.mode.kind === 'create') {
        await create.mutateAsync(buildCreateBody(state, acceptedIds, up));
      } else {
        await update.mutateAsync({
          id: state.mode.item.id,
          body: buildUpdateBody(state, acceptedIds, up),
        });
      }

      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
      return true;
    } catch (e) {
      setError(mutationErrorMessage(e, t("Couldn't save")));
      return false;
    } finally {
      setPending(false);
    }
  };

  return { submit, pending, error };
}
