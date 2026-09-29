import { useVideoPlayer, VideoView } from 'expo-video';
import type { StyleProp, ViewStyle } from 'react-native';

export interface LoopingVideoProps {
  /** Bundled asset module (`require('…mp4')`), e.g. `video.login`. */
  source: number;
  style?: StyleProp<ViewStyle>;
}

/** Muted, looping, control-less background video (login screen). */
export function LoopingVideo({ source, style }: LoopingVideoProps) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={style} nativeControls={false} contentFit="cover" />;
}
