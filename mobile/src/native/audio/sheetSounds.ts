import { createAudioPlayer } from 'expo-audio';
import { AppState } from 'react-native';
import { canPlayInterfaceAudio, onVoiceAudio } from './focus';
const sources = {
  opening: require('../../../assets/audio/openingSheetShoud.mp3'),
  navigate: require('../../../assets/audio/navigateFromSheetSound.mp3'),
};
/** Does not reconfigure the shared recording session or request audio permissions. */
export function playSheetSound(kind: keyof typeof sources) {
  if (!canPlayInterfaceAudio() || AppState.currentState !== 'active') return;
  const player = createAudioPlayer(sources[kind]);
  let finished = false;
  const cleanup = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    subscription.remove();
    appState.remove();
    release();
    player.remove();
  };
  const subscription = player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) cleanup();
  });
  const appState = AppState.addEventListener('change', (state) => {
    if (state !== 'active') cleanup();
  });
  const release = onVoiceAudio(cleanup);
  const timeout = setTimeout(cleanup, 10_000);
  try {
    player.play();
  } catch {
    cleanup();
  }
}
