/** Voice recording/playback takes priority over short interface effects. */
const voiceOwners = new Set<symbol>();
const listeners = new Set<() => void>();
export function claimVoiceAudio(owner: symbol) {
  voiceOwners.add(owner);
  listeners.forEach((stop) => stop());
}
export function releaseVoiceAudio(owner: symbol) {
  voiceOwners.delete(owner);
}
export function canPlayInterfaceAudio() {
  return voiceOwners.size === 0;
}
export function onVoiceAudio(stop: () => void) {
  listeners.add(stop);
  return () => {
    listeners.delete(stop);
  };
}
