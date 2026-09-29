import type { FC } from 'react';
import {
  Image,
  type ImageSourcePropType,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';
import type { SvgProps } from 'react-native-svg';

import { Button } from '@/ui/components/Button';
import { colors, spacing } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export interface EmptyStateProps {
  illustration?: FC<SvgProps> | ImageSourcePropType;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void };
  illustrationSize?: number;
  style?: StyleProp<ViewStyle>;
}

export function EmptyState({
  illustration,
  title,
  body,
  action,
  illustrationSize = 160,
  style,
}: EmptyStateProps) {
  return (
    <View style={[styles.root, style]}>
      {illustration ? (
        <View style={styles.illustration}>
          {typeof illustration === 'function' ? (
            <SvgIllustration component={illustration} size={illustrationSize} />
          ) : (
            <Image
              source={illustration}
              style={{ width: illustrationSize, height: illustrationSize }}
              resizeMode="contain"
            />
          )}
        </View>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      {action ? (
        <Button
          variant="secondary"
          title={action.label}
          onPress={action.onPress}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

function SvgIllustration({ component: Svg, size }: { component: FC<SvgProps>; size: number }) {
  return <Svg width={size} height={size} />;
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.sm },
  illustration: { marginBottom: spacing.sm },
  title: { ...beVietnamPro(16, 'semibold'), color: colors.contentB, textAlign: 'center' },
  body: { ...beVietnamPro(14), color: colors.contentM, textAlign: 'center', lineHeight: 20 },
  action: { marginTop: spacing.md, height: 44 },
});
