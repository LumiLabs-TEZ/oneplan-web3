/**
 * Photo strip + add tile — port of `PlanFormView.photoSection`
 * (`ios/OnePlan/OnePlan/View/Plan/PlanFormView.swift:391-473`). The add tile hides once
 * `remainingSlots` reaches 0 (`MAX_IMAGES`, `planForm.ts`).
 */
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  type StyleProp,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { pickImages } from '@/native/imagePick';
import { useAppLanguage } from '@/i18n';
import { CachedImage } from '@/ui/components';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';

import { MAX_IMAGES } from '../planForm';

export interface PhotosSectionProps {
  existingImageUrls: readonly string[];
  newImageUris: readonly string[];
  remainingSlots: number;
  onAddImages: (uris: string[]) => void;
  onRemoveExisting: (index: number) => void;
  onRemoveNew: (index: number) => void;
  style?: StyleProp<ViewStyle>;
}

export function PhotosSection({
  existingImageUrls,
  newImageUris,
  remainingSlots,
  onAddImages,
  onRemoveExisting,
  onRemoveNew,
  style,
}: PhotosSectionProps) {
  useAppLanguage();
  const { t } = useTranslation();
  const total = existingImageUrls.length + newImageUris.length;

  const onAdd = async () => {
    if (remainingSlots <= 0) return;
    const uris = await pickImages(remainingSlots);
    if (uris.length > 0) onAddImages(uris);
  };

  return (
    <View style={[styles.root, style]}>
      <Text style={styles.label}>{t('Photos (%lld/%lld)', { 0: total, 1: MAX_IMAGES })}</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {remainingSlots > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={onAdd}
              style={styles.addTile}
              testID="plan-photos-add"
            >
              <Ionicons name="add" size={28} color={colors.contentB} />
            </Pressable>
          ) : null}

          {existingImageUrls.map((uri, index) => (
            <View key={`existing-${index}`} style={styles.thumb}>
              <CachedImage uri={uri} contentFit="cover" style={StyleSheet.absoluteFill} />
              <Pressable
                accessibilityLabel={t('Remove')}
                onPress={() => onRemoveExisting(index)}
                style={styles.removeButton}
                testID={`plan-photos-remove-existing-${index}`}
              >
                <Ionicons name="close-circle" size={20} color={colors.white} />
              </Pressable>
            </View>
          ))}

          {newImageUris.map((uri, index) => (
            <View key={`new-${index}`} style={styles.thumb}>
              <CachedImage uri={uri} contentFit="cover" style={StyleSheet.absoluteFill} />
              <Pressable
                accessibilityLabel={t('Remove')}
                onPress={() => onRemoveNew(index)}
                style={styles.removeButton}
                testID={`plan-photos-remove-new-${index}`}
              >
                <Ionicons name="close-circle" size={20} color={colors.white} />
              </Pressable>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // White card like iOS `photoSection` (`PlanFormView.swift:389-460`).
  root: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: colors.white,
  },
  label: { ...beVietnamPro(14), color: colors.contentM },
  row: { flexDirection: 'row', gap: 4 },
  addTile: {
    width: 112,
    height: 112,
    borderRadius: 12,
    backgroundColor: colors.neutral100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  thumb: {
    width: 112,
    height: 112,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.neutral100,
  },
  removeButton: { position: 'absolute', top: 4, right: 4 },
});
