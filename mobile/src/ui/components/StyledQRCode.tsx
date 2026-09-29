import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { roundedQrPath } from '@/ui/qrMatrix';
import { qrMatrix } from '@/native/qrMatrix';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

export function StyledQRCode({
  value,
  size,
  color,
  backgroundColor = 'transparent',
}: {
  value: string;
  size: number;
  color: string;
  backgroundColor?: string;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const matrix = useMemo(() => qrMatrix(value), [value]);
  const path = useMemo(() => (matrix ? roundedQrPath(matrix) : ''), [matrix]);
  if (!matrix) {
    return (
      <View style={[styles.unavailable, { width: size, height: size }]}>
        <Text style={styles.label}>{t('QR unavailable')}</Text>
      </View>
    );
  }
  return (
    <Svg
      width={size}
      height={size}
      viewBox={`0 0 ${matrix.length} ${matrix.length}`}
      accessible={false}
    >
      <Rect width={matrix.length} height={matrix.length} fill={backgroundColor} />
      <Path d={path} fill={color} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  unavailable: {
    borderRadius: 12,
    backgroundColor: 'rgba(128,128,128,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { ...beVietnamPro(14), color: colors.contentM },
});
