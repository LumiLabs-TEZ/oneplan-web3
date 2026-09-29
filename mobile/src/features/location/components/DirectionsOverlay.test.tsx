import { fireEvent, render, screen } from '@testing-library/react-native';
import { t } from 'i18next';
import { Platform } from 'react-native';

import { directionsModel } from '@/features/location/helpers/directions';
import { openDirections } from '@/features/plan/helpers/openInMaps';
import { initI18n } from '@/i18n';

import { DirectionsOverlay } from './DirectionsOverlay';

jest.mock('@/features/plan/helpers/openInMaps', () => ({
  openDirections: jest.fn(async () => undefined),
}));

const USER = { latitude: 10.77, longitude: 106.69 };
const PLACE = { latitude: 10.78, longitude: 106.7 };

beforeAll(() => {
  initI18n();
});

afterEach(() => {
  jest.clearAllMocks();
});

function buildModel(mode: 'walk' | 'car') {
  const model = directionsModel(USER, PLACE, mode, 'en', t);
  if (!model) throw new Error('expected a model');
  return model;
}

describe('DirectionsOverlay', () => {
  it('renders "N mins" with the travel mode label in the route strip', async () => {
    const model = buildModel('walk');
    await render(
      <DirectionsOverlay
        minutes={model.minutes}
        mode="walk"
        onMode={jest.fn()}
        onClose={jest.fn()}
        destination={PLACE}
        name="Test place"
      />,
    );
    expect(screen.getByText(`${model.minutes} mins`)).toBeTruthy();
    expect(screen.getByText(/by foot/)).toBeTruthy();
  });

  it('labels the car mode "by car" and marks it selected', async () => {
    await render(
      <DirectionsOverlay
        minutes={buildModel('car').minutes}
        mode="car"
        onMode={jest.fn()}
        onClose={jest.fn()}
        destination={PLACE}
        name="Test place"
        testID="overlay"
      />,
    );
    expect(screen.getByText(/by car/)).toBeTruthy();
    expect(screen.getByTestId('overlay-mode-car').props.accessibilityState).toEqual({
      selected: true,
    });
  });

  it('calls onMode when the walk/car toggle changes', async () => {
    const onMode = jest.fn();
    await render(
      <DirectionsOverlay
        minutes={buildModel('walk').minutes}
        mode="walk"
        onMode={onMode}
        onClose={jest.fn()}
        destination={PLACE}
        name="Test place"
        testID="overlay"
      />,
    );
    await fireEvent.press(screen.getByTestId('overlay-mode-car'));
    expect(onMode).toHaveBeenCalledWith('car');
  });

  it('calls onClose when the close button is pressed', async () => {
    const onClose = jest.fn();
    await render(
      <DirectionsOverlay
        minutes={buildModel('walk').minutes}
        mode="walk"
        onMode={jest.fn()}
        onClose={onClose}
        destination={PLACE}
        name="Test place"
        testID="overlay"
      />,
    );
    await fireEvent.press(screen.getByTestId('overlay-close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the Apple Maps button on iOS and calls openDirections for it', async () => {
    jest.replaceProperty(Platform, 'OS', 'ios');
    await render(
      <DirectionsOverlay
        minutes={buildModel('car').minutes}
        mode="car"
        onMode={jest.fn()}
        onClose={jest.fn()}
        destination={PLACE}
        name="Test place"
        testID="overlay"
      />,
    );
    const appleButton = screen.getByTestId('overlay-apple');
    expect(appleButton).toBeTruthy();
    await fireEvent.press(appleButton);
    expect(openDirections).toHaveBeenCalledWith(
      { destination: PLACE, mode: 'car', name: 'Test place' },
      'apple',
      expect.any(Function),
    );
  });

  it('hides the Apple Maps button on Android', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await render(
      <DirectionsOverlay
        minutes={buildModel('car').minutes}
        mode="car"
        onMode={jest.fn()}
        onClose={jest.fn()}
        destination={PLACE}
        name="Test place"
        testID="overlay"
      />,
    );
    expect(screen.queryByTestId('overlay-apple')).toBeNull();
  });

  it('calls openDirections for Google Maps', async () => {
    jest.replaceProperty(Platform, 'OS', 'android');
    await render(
      <DirectionsOverlay
        minutes={buildModel('car').minutes}
        mode="car"
        onMode={jest.fn()}
        onClose={jest.fn()}
        destination={PLACE}
        name="Test place"
        testID="overlay"
      />,
    );
    await fireEvent.press(screen.getByTestId('overlay-google'));
    expect(openDirections).toHaveBeenCalledWith(
      { destination: PLACE, mode: 'car', name: 'Test place' },
      'google',
      expect.any(Function),
    );
  });
});
