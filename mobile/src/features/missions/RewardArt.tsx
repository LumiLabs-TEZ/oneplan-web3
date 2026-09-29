import { Image, type ImageProps } from 'expo-image';
const assets = {
  scan_credit_1: require('../../../assets/images/missions/rewardScanCredit.png'),
  market_unlock: require('../../../assets/images/missions/rewardMarketUnlock.png'),
  pro_7d: require('../../../assets/images/missions/rewardPro7d.png'),
  pro_30d: require('../../../assets/images/missions/rewardPro30d.png'),
};
export function RewardArt({
  id,
  width,
  height,
  style,
  contentPosition = 'center',
}: {
  id: keyof typeof assets;
  width?: number;
  height?: number;
  style?: ImageProps['style'];
  contentPosition?: ImageProps['contentPosition'];
}) {
  return (
    <Image
      source={assets[id]}
      contentFit="contain"
      contentPosition={contentPosition}
      style={[{ width, height }, style]}
      accessible={false}
    />
  );
}
