import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { CompassPill } from './CompassPill';

const PLACE = { latitude: 10.78, longitude: 106.7 };
const USER = { latitude: 10.77, longitude: 106.69 };

beforeAll(() => {
  initI18n();
});

describe('CompassPill', () => {
  it('renders nothing when there is no user location fix', async () => {
    const { toJSON } = await render(
      <CompassPill userCoords={null} place={PLACE} deviceHeading={0} onPress={jest.fn()} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('shows the distance + "From you" label once a user fix exists', async () => {
    await render(
      <CompassPill
        userCoords={USER}
        place={PLACE}
        deviceHeading={0}
        onPress={jest.fn()}
        testID="compass"
      />,
    );
    expect(screen.getByText(/From you/)).toBeTruthy();
    expect(screen.getByText(/\d.*(?:km|m)$/)).toBeTruthy();
  });

  it('calls onPress when tapped', async () => {
    const onPress = jest.fn();
    await render(
      <CompassPill
        userCoords={USER}
        place={PLACE}
        deviceHeading={0}
        onPress={onPress}
        testID="compass"
      />,
    );
    await fireEvent.press(screen.getByTestId('compass'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
