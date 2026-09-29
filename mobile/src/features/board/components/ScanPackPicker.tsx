import { Ionicons } from '@expo/vector-icons';
import { useRef } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { useStore } from '@/iap/useStore';
import { SCAN_PACK_SKUS } from '@/features/subscription/types';
import { rasterIllustration } from '@/ui/components/RasterIllustration';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

// Rendered from the ~190 KB vector SVG to WebP (see RasterIllustration).
const FreeCard = rasterIllustration(
  require('@/assets/images/board/freeVideoScanCard.webp') as number,
  { width: 94, height: 96 },
);
export const FREE_SCAN = 'free-ad';
export function ScanPackPicker({
  selected,
  onSelect,
  disabled,
  showReward = false,
}: {
  selected: string;
  onSelect: (sku: string) => void;
  disabled: boolean;
  showReward?: boolean;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const ref = useRef<ScrollView>(null);
  const products = useStore((s) => s.products.packs).filter((p) =>
    (SCAN_PACK_SKUS as readonly string[]).includes(p.id),
  );
  const maxUnit = Math.max(
    0,
    ...products.map((p) => (p.price ?? 0) / Number(p.id.split('_').at(-1))),
  );
  const maxCount = Math.max(0, ...products.map((p) => Number(p.id.split('_').at(-1))));
  const ids = [...(showReward ? [FREE_SCAN] : []), ...products.map((p) => p.id)];
  const offsets = ids.map((_, index) =>
    index === 0 ? 0 : showReward ? 163 + (index - 1) * 251 : index * 251,
  );
  const select = (id: string, index: number) => {
    onSelect(id);
    ref.current?.scrollTo({ x: offsets[index] ?? 0, animated: true });
  };
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      snapToOffsets={offsets}
      decelerationRate="fast"
      contentContainerStyle={{
        gap: 12,
        paddingHorizontal: 22,
        paddingVertical: 5,
        paddingRight: 72,
      }}
      onContentSizeChange={() => {
        if (selected === SCAN_PACK_SKUS[0] && showReward)
          ref.current?.scrollTo({ x: 163, animated: false });
      }}
      onMomentumScrollEnd={(e) => {
        const x = e.nativeEvent.contentOffset.x;
        const nearest = offsets.reduce(
          (best, offset, i) => (Math.abs(offset - x) < Math.abs(offsets[best]! - x) ? i : best),
          0,
        );
        if (ids[nearest]) onSelect(ids[nearest]!);
      }}
    >
      {ids.map((id, index) => {
        const free = id === FREE_SCAN;
        const product = products.find((p) => p.id === id);
        const count = Number(id.split('_').at(-1));
        const active = selected === id;
        const save =
          !free && maxUnit > 0
            ? Math.round((1 - (product?.price ?? 0) / count / maxUnit) * 100)
            : 0;
        const foreground = active ? 'white' : colors.contentB;
        return (
          <Pressable
            key={id}
            testID={`scan-pack-${id}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: active, disabled }}
            disabled={disabled}
            onPress={() => select(id, index)}
            style={{
              width: free ? 151 : 239,
              height: 131,
              borderRadius: 20,
              overflow: 'hidden',
              backgroundColor: active ? colors.blueBase : colors.neutral100,
              transform: [{ scale: active ? 1.04 : 1 }],
            }}
          >
            {free ? (
              <View style={{ position: 'absolute', left: 91, top: 41 }}>
                <FreeCard width={94} height={96} />
              </View>
            ) : null}
            <View style={{ padding: 16, gap: 4, flex: 1, paddingRight: free ? 16 : 48 }}>
              <Text
                numberOfLines={1}
                style={{ ...beVietnamPro(16, 'semibold'), letterSpacing: -0.48, color: foreground }}
              >
                {free
                  ? t('Get 1 free')
                  : count === 1
                    ? t('1 video scan')
                    : t('%lld video scans', { 0: count, count })}
              </Text>
              <Text style={{ ...beVietnamPro(14), color: foreground, letterSpacing: -0.42 }}>
                {free ? t('Watch ads') : product?.displayPrice}
              </Text>
              <View style={{ flex: 1 }} />
              {free || count === 1 || count === maxCount ? (
                <Text style={{ ...beVietnamPro(14), color: active ? 'white' : colors.contentM }}>
                  {t(free ? 'Max 3/day' : count === 1 ? 'Most popular' : 'Best value')}
                </Text>
              ) : null}
            </View>
            {!free && active ? (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color="white"
                style={{ position: 'absolute', top: 16, right: 16 }}
              />
            ) : null}
            {save >= 1 ? (
              <LinearGradient
                colors={['#6391FF', '#94D1FF']}
                style={{
                  position: 'absolute',
                  bottom: 14,
                  right: 16,
                  borderWidth: 1,
                  borderColor: 'white',
                  borderRadius: 99,
                  paddingHorizontal: 13,
                  height: 33,
                  justifyContent: 'center',
                }}
              >
                <Text style={{ ...beVietnamPro(14), color: 'white' }}>
                  {t('Save %lld%%', { 0: save })}
                </Text>
              </LinearGradient>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}
