import { Ionicons } from '@expo/vector-icons';
import { Linking, Modal, Platform, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAppLanguage } from '@/i18n';
import { MapUnavailable } from '@/native/maps/MapUnavailable';
import { isMapAvailable, mapProvider } from '@/native/maps/provider';
import { Button } from '@/ui/components';
import { LocationSheet } from '@/features/location/components/LocationSheet';
import { googleMapsUrl, placeQuery } from '@/features/plan/helpers/geo';
import { colors } from '@/ui/theme';
import type { BoardPin } from '../types';
export function PinDetailSheet({
  pin,
  onClose,
  onAdd,
}: {
  pin: BoardPin;
  onClose: () => void;
  onAdd: () => void;
  onDelete?: () => void;
}) {
  useAppLanguage();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  if (pin.latitude == null || pin.longitude == null) return null;
  const coordinate = { latitude: pin.latitude, longitude: pin.longitude };
  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {isMapAvailable() ? (
          <MapView
            provider={mapProvider()}
            style={{ flex: 1 }}
            initialRegion={{ ...coordinate, latitudeDelta: 0.015, longitudeDelta: 0.015 }}
          >
            <Marker coordinate={coordinate} title={pin.name} />
          </MapView>
        ) : (
          <MapUnavailable style={{ flex: 1 }} />
        )}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 16,
            right: 16,
            flexDirection: 'row',
            justifyContent: 'space-between',
          }}
        >
          <Button
            variant="toolbarIcon"
            accessibilityLabel={t('Close')}
            onPress={onClose}
            icon={<Ionicons name="close" size={22} color={colors.contentB} />}
          />
          <Button
            variant="toolbarIcon"
            accessibilityLabel={t('Directions')}
            icon={<Ionicons name="navigate" size={22} color={colors.blueBase} />}
            onPress={() => {
              void Linking.openURL(
                Platform.OS === 'ios'
                  ? `https://maps.apple.com/?daddr=${pin.latitude},${pin.longitude}`
                  : googleMapsUrl({
                      destination: coordinate,
                      mode: 'car',
                      destinationQuery: placeQuery(pin.name, pin.address),
                    }),
              );
            }}
          />
        </View>
        <LocationSheet
          content="detail"
          mode="pick"
          query=""
          onQueryChange={() => undefined}
          results={[]}
          recents={[]}
          suggested={[]}
          showSuggested={false}
          onSelectResult={() => undefined}
          onSelectRecent={() => undefined}
          detailPlace={{
            name: pin.name,
            address: pin.address ?? null,
            category: pin.category ?? null,
          }}
          distanceText={null}
          onAddToPlan={onAdd}
          onIndexChange={() => undefined}
        />
      </GestureHandlerRootView>
    </Modal>
  );
}
