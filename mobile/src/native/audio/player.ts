/**
 * Voice-note playback hook. Port of `PlanVoicePlaybackService.swift`: plays an http(s) URL
 * directly, otherwise resolves an S3 object key to a presigned URL first; resets to the start
 * when playback finishes; toggling the same source that's already playing pauses it.
 *
 * Verified against `node_modules/expo-audio/build/{ExpoAudio,AudioModule.types,Audio.types}.d.ts`:
 * - `useAudioPlayer(source?, options?): AudioPlayer`
 * - `useAudioPlayerStatus(player): AudioStatus` (`{ playing, currentTime, duration,
 *   didJustFinish, ... }`)
 * - `player.play(): void`, `player.pause(): void`, `player.seekTo(seconds): Promise<void>`.
 */
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useRef } from 'react';

import { claimVoiceAudio, releaseVoiceAudio } from './focus';

import { useDownloadUrl } from '@/features/plan/api/queries';

export interface UseVoicePlayerResult {
  playing: boolean;
  /** 0-1 playback progress; 0 when duration is unknown. */
  progress: number;
  toggle(): void;
  stop(): void;
}

function isHttpUrl(value: string): boolean {
  return /^https?:/.test(value);
}

/**
 * `source` is either an already-playable http(s) URL, an S3 object key to resolve first, or
 * `null` (nothing to play — e.g. no voice note attached).
 */
export function useVoicePlayer(source: string | null): UseVoicePlayerResult {
  const isHttp = !!source && isHttpUrl(source);
  const { data: resolvedUrl } = useDownloadUrl(!isHttp ? source : null);
  const playableUrl = source == null ? null : isHttp ? source : (resolvedUrl ?? null);

  const player = useAudioPlayer(playableUrl);
  const status = useAudioPlayerStatus(player);

  const lastSourceRef = useRef<string | null>(null);
  const audioOwner = useRef(Symbol('player'));
  useEffect(() => {
    const owner = audioOwner.current;
    if (status.playing) claimVoiceAudio(owner);
    else releaseVoiceAudio(owner);
    return () => releaseVoiceAudio(owner);
  }, [status.playing]);

  useEffect(() => {
    if (status.didJustFinish) {
      void player.seekTo(0);
      player.pause();
    }
  }, [status.didJustFinish, player]);

  const toggle = () => {
    if (playableUrl == null) return;
    void setAudioModeAsync({ playsInSilentMode: true });
    if (status.playing && lastSourceRef.current === playableUrl) {
      player.pause();
      releaseVoiceAudio(audioOwner.current);
      return;
    }
    lastSourceRef.current = playableUrl;
    claimVoiceAudio(audioOwner.current);
    player.play();
  };

  const stop = () => {
    releaseVoiceAudio(audioOwner.current);
    player.pause();
    void player.seekTo(0);
  };

  const progress = status.duration > 0 ? status.currentTime / status.duration : 0;

  return { playing: status.playing, progress, toggle, stop };
}
