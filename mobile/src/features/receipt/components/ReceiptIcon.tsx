import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Platform } from 'react-native';
import { CachedImage } from '@/ui/components/CachedImage';

const symbols = {
  back: ['chevron.left', 'chevron-back'],
  confirm: ['checkmark', 'checkmark'],
  photo: ['photo', 'image-outline'],
  camera: ['camera.fill', 'camera'],
  flip: ['camera.rotate', 'camera-reverse-outline'],
  undo: ['arrow.uturn.backward', 'arrow-undo'],
  reset: ['arrow.clockwise', 'reload'],
} as const;
/** Android paths are app-owned; iOS uses the actual SF Symbol from the source via Expo Image's native symbol renderer. */
export function ReceiptIcon({
  name,
  size,
  color,
  weight = '600',
}: {
  name: keyof typeof symbols;
  size: number;
  color: string;
  weight?: '500' | '600' | '700';
}) {
  const [symbol] = symbols[name];
  if (Platform.OS === 'ios')
    return (
      <CachedImage
        uri={`sf:/${symbol}`}
        contentFit="contain"
        transition={0}
        style={{
          width: size + 4,
          height: size + 4,
          fontSize: size,
          fontWeight: weight,
          tintColor: color,
        }}
      />
    );
  return (
    <Svg
      width={size + 4}
      height={size + 4}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={weight === '700' ? 2.6 : weight === '600' ? 2.2 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
    >
      {name === 'back' ? <Path d="M15 4 7 12l8 8" /> : null}
      {name === 'confirm' ? <Path d="m4 12 5 5L20 5" /> : null}
      {name === 'photo' ? (
        <>
          <Rect x="2" y="4" width="20" height="16" rx="2" />
          <Circle cx="7" cy="9" r="1.5" fill={color} stroke="none" />
          <Path d="m3 18 6-6 4 4 3-3 5 5" />
        </>
      ) : null}
      {name === 'camera' ? (
        <Path
          fill={color}
          stroke="none"
          fillRule="evenodd"
          d="M4 6h3l1.5-2h7L17 6h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Zm8 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0 2a3 3 0 1 1 0 6 3 3 0 0 1 0-6Z"
        />
      ) : null}
      {name === 'flip' ? (
        <>
          <Path d="M4 6h3l1.5-2h7L17 6h3a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" />
          <Path
            d="M8 12a4 4 0 0 1 7-1l1 1m0-3v3h-3m3 3a4 4 0 0 1-7 1l-1-1m0 3v-3h3"
            strokeWidth="1.5"
          />
        </>
      ) : null}
      {name === 'undo' ? <Path d="m8 4-6 6 6 6M3 10h11a7 7 0 0 1 7 7v3" /> : null}
      {name === 'reset' ? <Path d="M19 7a8 8 0 1 0 1 8M19 2v5h-5" /> : null}
    </Svg>
  );
}
