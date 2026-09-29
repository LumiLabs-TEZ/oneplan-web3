/**
 * Pure waveform helpers shared by the voice-recorder/player hooks. Mirrors
 * `AudioRecordingManager.swift:87-100` — 51-bar rolling buffer, ~15 Hz metering,
 * dB normalised into 0-1 with a noise floor of -60 dBFS.
 */

export const WAVEFORM_BARS = 51;
export const MAX_RECORD_SECONDS = 15;
export const METER_HZ = 15;

/** clamp((db + 60) / 60, 0, 1) — -60 dBFS (silence) -> 0, 0 dBFS (peak) -> 1. */
export function normalizeDb(db: number): number {
  const value = (db + 60) / 60;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Appends `value` to `buf`, dropping the oldest entries so length never exceeds `max`. */
export function pushSample(buf: readonly number[], value: number, max = WAVEFORM_BARS): number[] {
  const next = [...buf, value];
  if (next.length <= max) return next;
  return next.slice(next.length - max);
}

/**
 * Deterministic pseudo-random bars for a static/placeholder waveform (e.g. a recorded
 * voice note before playback starts, or as a fallback if live metering is unavailable).
 * Same `seed` always produces the same bars.
 */
export function staticBars(seed: number, count = WAVEFORM_BARS): number[] {
  let state = seed >>> 0 || 1;
  const bars: number[] = [];
  for (let i = 0; i < count; i++) {
    // xorshift32 — small, deterministic, no external dependency.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    bars.push(state / 0xffffffff);
  }
  return bars;
}
