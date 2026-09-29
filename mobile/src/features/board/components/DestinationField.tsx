import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Keyboard, Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import type { LocationSearchResultDto } from '@/features/location/api/queries';
import { LocationPickerScreen } from '@/features/location/components/LocationPickerScreen';
import { colors } from '@/ui/theme';
import { beVietnamPro } from '@/ui/typography';
import { styles } from './common';
/** Field label of the Generate-trip form (`fieldLabel` in `GenerateTripBottomSheet.swift`). */
export const fieldLabel = {
  ...beVietnamPro(16, 'medium'),
  color: colors.contentM,
  letterSpacing: -0.32,
};
export function destinationIds(location: LocationSearchResultDto | null) {
  return location
    ? { countryId: location.country.id, stateId: location.state?.id, cityId: location.city?.id }
    : {};
}
/** Location row + the same full-screen picker as Create New Trip (`LocationPickerScreen`). */
export function DestinationField({
  value,
  onChange,
  label,
  variant = 'inline',
}: {
  value: LocationSearchResultDto | null;
  onChange: (v: LocationSearchResultDto) => void;
  label?: string;
  /**
   * `inline`: "Location *" row (Create/Edit Board). `field`: label above a chevron row
   * (`GenerateTripBottomSheet.swift` `locationField`).
   */
  variant?: 'inline' | 'field';
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const [isOpen, setOpen] = useState(false);
  const text = value
    ? [value.city?.name, value.state?.name, value.country.name].filter(Boolean).join(', ')
    : label;
  const open = () => {
    Keyboard.dismiss();
    setOpen(true);
  };
  return (
    <>
      {variant === 'field' ? (
        <View style={{ gap: 8 }}>
          <Text style={fieldLabel}>{t('Location')}</Text>
          <Pressable
            testID="board-destination"
            accessibilityRole="button"
            accessibilityLabel={t('Location')}
            accessibilityValue={{ text: text ?? t('Not set') }}
            onPress={open}
            style={[
              styles.row,
              {
                gap: 12,
                backgroundColor: 'white',
                borderRadius: 16,
                paddingHorizontal: 16,
                paddingVertical: 14,
              },
            ]}
          >
            <Text
              numberOfLines={1}
              ellipsizeMode="middle"
              style={{
                ...beVietnamPro(16),
                letterSpacing: -0.32,
                flex: 1,
                color: text ? colors.contentB : colors.contentL,
              }}
            >
              {text ?? t('Choose a destination')}
            </Text>
            <Ionicons name="chevron-forward" size={14} color={colors.contentL} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          testID="board-destination"
          accessibilityRole="button"
          onPress={open}
          style={[
            styles.row,
            { backgroundColor: 'white', borderRadius: 20, paddingHorizontal: 16, minHeight: 48 },
          ]}
        >
          <Text style={{ ...beVietnamPro(15), color: colors.contentM }}>
            {t('Location')} <Text style={{ color: colors.warning500 }}>*</Text>
          </Text>
          <Text
            numberOfLines={1}
            style={[
              styles.text,
              { flex: 1, textAlign: 'right', color: text ? colors.contentB : colors.contentL },
            ]}
          >
            {text ?? t('Choose')}
          </Text>
        </Pressable>
      )}
      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setOpen(false)}
      >
        <LocationPickerScreen
          onClose={() => setOpen(false)}
          onSelect={(result) => {
            onChange(result);
            setOpen(false);
          }}
        />
      </Modal>
    </>
  );
}
