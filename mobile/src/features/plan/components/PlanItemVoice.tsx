/**
 * Per-item voice-playback wrapper for the plan timeline. Each timeline row mounts one of these so
 * `useVoicePlayer` (and the S3-key resolution behind it) lives per plan item rather than being
 * shared — `TripPlanSection` holds the single `playingId` so at most one card plays at a time
 * (mirrors `PlanItem.swift`'s single `AudioPlayerService.currentlyPlayingId` — there's no RN
 * equivalent singleton, so it's plain lifted state instead).
 *
 * A render-prop (`children`) hands the computed `{ playing, onToggle }` to whatever renders the
 * actual pill (`PlanItemCard`'s `voice` prop, or a bespoke badge like the plan-detail history
 * card) — this component owns no UI of its own.
 */
import { useEffect, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert } from 'react-native';

import { useDownloadUrl } from '@/features/plan/api/queries';
import { useAppLanguage } from '@/i18n';
import { useVoicePlayer, type UseVoicePlayerResult } from '@/native/audio';

import type { PlanItemDto } from '../types';

function isHttpUrl(value: string): boolean {
  return /^https?:/.test(value);
}

export interface UsePlayableVoiceResult extends UseVoicePlayerResult {
  /** `true` when an S3-key voice note failed to resolve to a downloadable URL. */
  isError: boolean;
}

/**
 * Wraps `useVoicePlayer` with the S3-key resolution failure surfaced — the player itself stays a
 * silent no-op when the download-url lookup errors, so callers that want to alert the user (this
 * component, and the plan-detail history card's audio badge) need this instead of the bare hook.
 */
export function usePlayableVoice(voiceUrl: string | null): UsePlayableVoiceResult {
  const isHttp = !!voiceUrl && isHttpUrl(voiceUrl);
  const download = useDownloadUrl(!isHttp ? voiceUrl : null);
  const player = useVoicePlayer(voiceUrl);
  return { ...player, isError: download.isError };
}

export interface PlanItemVoiceProps {
  item: PlanItemDto;
  /** Whether this item is the one `TripPlanSection` currently designates as playing. */
  active: boolean;
  onActivate: (id: number) => void;
  children: (voice: { playing: boolean; onToggle: () => void }) => ReactNode;
}

export function PlanItemVoice({ item, active, onActivate, children }: PlanItemVoiceProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const voice = usePlayableVoice(item.voiceUrl ?? null);

  // Another card became active — stop this one so only one voice note plays at a time.
  useEffect(() => {
    if (!active && voice.playing) voice.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to `active` flipping off
  }, [active]);

  const onToggle = () => {
    if (voice.isError) {
      Alert.alert(t('Unable to play voice message.'));
      return;
    }
    if (!active) onActivate(item.id);
    voice.toggle();
  };

  return <>{children({ playing: voice.playing, onToggle })}</>;
}
