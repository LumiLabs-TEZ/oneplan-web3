/**
 * Voice-note recorder hook. Port of `AudioRecordingManager.swift` behaviour: AAC/44.1kHz/mono
 * m4a, 15s hard cap via a 1Hz-equivalent poll (`useAudioRecorderState` at `1000 / METER_HZ` ms),
 * live metering normalised into a rolling `WAVEFORM_BARS`-entry buffer.
 *
 * Verified against `node_modules/expo-audio/build/{ExpoAudio,AudioModule,AudioModule.types,
 * Audio.types,RecordingConstants,utils/useAudioRecorderState}.d.ts`:
 * - `useAudioRecorder(options, statusListener?): AudioRecorder`
 * - `useAudioRecorderState(recorder, interval?): RecorderState` (`{ canRecord, isRecording,
 *   durationMillis, mediaServicesDidReset, metering?, url }`)
 * - `RecordingOptions.isMeteringEnabled?: boolean` — exists, drives `metering` on the state.
 * - `AudioModule.requestRecordingPermissionsAsync(): Promise<PermissionResponse>`
 * - `setAudioModeAsync(mode: Partial<AudioMode>): Promise<void>`
 * - `recorder.prepareToRecordAsync(options?): Promise<void>`, `recorder.record(): void`,
 *   `recorder.stop(): Promise<void>`.
 */
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';

import { claimVoiceAudio, releaseVoiceAudio } from './focus';

import { MAX_RECORD_SECONDS, METER_HZ, WAVEFORM_BARS, normalizeDb, pushSample } from './waveform';

export type RecorderStatus = 'idle' | 'recording' | 'recorded';

export interface RecorderState {
  status: RecorderStatus;
  seconds: number;
  bars: number[];
  uri: string | null;
  error: string | null;
}

export interface UseVoiceRecorderResult extends RecorderState {
  /**
   * No-op while a start is already in flight or `status !== 'idle'` — in particular, a
   * `'recorded'` session must be cleared with `reset()` before starting a new recording.
   */
  start(): Promise<void>;
  stop(): Promise<void>;
  reset(): void;
}

const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.m4a',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 128000,
  isMeteringEnabled: true,
};

export function useVoiceRecorder(opts: { maxSeconds?: number } = {}): UseVoiceRecorderResult {
  const maxSeconds = opts.maxSeconds ?? MAX_RECORD_SECONDS;

  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 1000 / METER_HZ);

  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [bars, setBars] = useState<number[]>([]);
  const [uri, setUri] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const audioOwner = useRef(Symbol('recorder'));
  useEffect(() => {
    const owner = audioOwner.current;
    return () => releaseVoiceAudio(owner);
  }, []);
  const stoppingRef = useRef(false);
  const startingRef = useRef(false);

  const stop = useCallback(async () => {
    if (stoppingRef.current || status !== 'recording') return;
    stoppingRef.current = true;
    try {
      const durationMillis = recorder.currentTime * 1000 || recorderState.durationMillis;
      await recorder.stop();
      setSeconds(Math.max(1, Math.round(durationMillis / 1000)));
      setUri(recorder.uri);
      setStatus('recorded');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('idle');
    } finally {
      stoppingRef.current = false;
      releaseVoiceAudio(audioOwner.current);
    }
  }, [recorder, recorderState.durationMillis, status]);

  // 15s hard cap, driven off the polled recorder state (mirrors the iOS 1Hz timer).
  useEffect(() => {
    if (status === 'recording' && recorderState.durationMillis >= maxSeconds * 1000) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- external event (native recorder poll hitting the 15s cap) → state, no render loop
      void stop();
    }
  }, [status, recorderState.durationMillis, maxSeconds, stop]);

  // Live metering -> rolling waveform buffer while recording.
  useEffect(() => {
    if (status !== 'recording' || recorderState.metering === undefined) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- external event (native recorder metering poll) → state, no render loop
    setBars((prev) =>
      pushSample(prev, normalizeDb(recorderState.metering as number), WAVEFORM_BARS),
    );
  }, [status, recorderState.metering]);

  // Re-entrancy guard: a start already in flight (still awaiting permissions/prepare) or an
  // existing 'recording'/'recorded' session must block a second start — a recorded session needs
  // an explicit reset() first, otherwise a second start() could call recorder.record() twice or
  // reset bars/uri/seconds mid-recording.
  const start = useCallback(async () => {
    if (startingRef.current || status !== 'idle') return;
    startingRef.current = true;
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('permission_denied');
        return;
      }
      claimVoiceAudio(audioOwner.current);
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setBars([]);
      setUri(null);
      setSeconds(0);
      setStatus('recording');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      releaseVoiceAudio(audioOwner.current);
    } finally {
      startingRef.current = false;
    }
  }, [recorder, status]);

  const reset = useCallback(() => {
    setStatus('idle');
    setBars([]);
    setUri(null);
    setSeconds(0);
    setError(null);
  }, []);

  // `seconds` state is only finalised on stop; while recording, report the live elapsed time
  // from the polled native state so the recording card's m:ss timer ticks.
  const liveSeconds =
    status === 'recording' ? Math.floor(recorderState.durationMillis / 1000) : seconds;

  return { status, seconds: liveSeconds, bars, uri, error, start, stop, reset };
}
