import { canPlayInterfaceAudio, claimVoiceAudio, onVoiceAudio, releaseVoiceAudio } from './focus';
it('suppresses effects for every voice owner and interrupts playing effects', () => {
  const recording = Symbol();
  const playing = Symbol();
  const stop = jest.fn();
  const unsubscribe = onVoiceAudio(stop);
  expect(canPlayInterfaceAudio()).toBe(true);
  claimVoiceAudio(recording);
  claimVoiceAudio(playing);
  expect(stop).toHaveBeenCalledTimes(2);
  releaseVoiceAudio(recording);
  expect(canPlayInterfaceAudio()).toBe(false);
  releaseVoiceAudio(playing);
  expect(canPlayInterfaceAudio()).toBe(true);
  unsubscribe();
});
