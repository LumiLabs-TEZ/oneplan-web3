import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import * as Location from 'expo-location';

import { LocationMap } from './LocationMap';

const reverseGeocodeAsync = Location.reverseGeocodeAsync as jest.Mock;

const REGION = { latitude: 10.77, longitude: 106.7, latitudeDelta: 0.02, longitudeDelta: 0.02 };
const COORD = { latitude: 10.78, longitude: 106.71 };

describe('LocationMap', () => {
  beforeEach(() => {
    reverseGeocodeAsync.mockReset();
  });

  it('uses the localized droppedPinName when reverse geocoding returns nothing', async () => {
    reverseGeocodeAsync.mockResolvedValueOnce([{}]);
    const onMapPick = jest.fn();
    await render(
      <LocationMap
        mapRef={{ current: null }}
        place={null}
        initialRegion={REGION}
        onMapPick={onMapPick}
        droppedPinName="Ghim đã thả"
      />,
    );

    await fireEvent(screen.getByTestId('location-map'), 'longPress', {
      nativeEvent: { coordinate: COORD },
    });

    await waitFor(() => expect(onMapPick).toHaveBeenCalledTimes(1));
    expect(onMapPick.mock.calls[0][0]).toMatchObject({ name: 'Ghim đã thả', source: 'map' });
  });

  it('falls back to droppedPinName when reverse geocoding rejects', async () => {
    reverseGeocodeAsync.mockRejectedValueOnce(new Error('offline'));
    const onMapPick = jest.fn();
    await render(
      <LocationMap
        mapRef={{ current: null }}
        place={null}
        initialRegion={REGION}
        onMapPick={onMapPick}
        droppedPinName="Ghim đã thả"
      />,
    );

    await fireEvent(screen.getByTestId('location-map'), 'longPress', {
      nativeEvent: { coordinate: COORD },
    });

    await waitFor(() => expect(onMapPick).toHaveBeenCalledTimes(1));
    expect(onMapPick.mock.calls[0][0]).toMatchObject({ name: 'Ghim đã thả', source: 'map' });
  });

  it('prefers the POI name over droppedPinName on a POI tap', async () => {
    reverseGeocodeAsync.mockResolvedValueOnce([{}]);
    const onMapPick = jest.fn();
    await render(
      <LocationMap
        mapRef={{ current: null }}
        place={null}
        initialRegion={REGION}
        onMapPick={onMapPick}
        droppedPinName="Ghim đã thả"
      />,
    );

    await fireEvent(screen.getByTestId('location-map'), 'poiClick', {
      nativeEvent: { coordinate: COORD, name: 'Cafe X', placeId: 'poi-1' },
    });

    await waitFor(() => expect(onMapPick).toHaveBeenCalledTimes(1));
    expect(onMapPick.mock.calls[0][0]).toMatchObject({ name: 'Cafe X' });
  });

  describe('plain press vs POI tap (iOS fires both for one POI tap, in either order)', () => {
    const POI_EVENT = { nativeEvent: { coordinate: COORD, name: 'Cafe', placeId: '' } };

    async function renderMap(onPress: jest.Mock) {
      reverseGeocodeAsync.mockResolvedValue([{}]);
      await render(
        <LocationMap
          mapRef={{ current: null }}
          place={null}
          initialRegion={REGION}
          onPress={onPress}
          onMapPick={jest.fn()}
          droppedPinName="Dropped pin"
        />,
      );
    }

    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('fires onPress for a plain tap once the grace period passes', async () => {
      const onPress = jest.fn();
      await renderMap(onPress);
      await fireEvent.press(screen.getByTestId('location-map'));
      expect(onPress).not.toHaveBeenCalled();
      jest.advanceTimersByTime(500);
      expect(onPress).toHaveBeenCalledTimes(1);
    });

    it('drops the press when the POI tap arrives after it', async () => {
      const onPress = jest.fn();
      await renderMap(onPress);
      await fireEvent.press(screen.getByTestId('location-map'));
      jest.advanceTimersByTime(400);
      await fireEvent(screen.getByTestId('location-map'), 'poiClick', POI_EVENT);
      jest.advanceTimersByTime(1000);
      expect(onPress).not.toHaveBeenCalled();
    });

    it('drops the press when it arrives after the POI tap', async () => {
      const onPress = jest.fn();
      await renderMap(onPress);
      await fireEvent(screen.getByTestId('location-map'), 'poiClick', POI_EVENT);
      jest.advanceTimersByTime(600);
      await fireEvent.press(screen.getByTestId('location-map'));
      jest.advanceTimersByTime(1000);
      expect(onPress).not.toHaveBeenCalled();
    });
  });
});
