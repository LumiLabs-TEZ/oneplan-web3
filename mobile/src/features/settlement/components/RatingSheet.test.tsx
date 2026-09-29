import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { RatingSheet } from './RatingSheet';

const props = {
  listingName: 'Da Lat Trip for Friends',
  placesText: '21 places',
  durationText: '3 days',
  thumbnailUrl: null,
};

describe('RatingSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders five stars and the trip summary', async () => {
    const screen = await render(<RatingSheet {...props} onContinue={jest.fn()} />);
    expect(screen.getByText('Da Lat Trip for Friends')).toBeTruthy();
    expect(screen.getByText('21 places')).toBeTruthy();
    expect(screen.getByText('3 days')).toBeTruthy();
    expect(screen.getByText('Rate your experience with this Plan')).toBeTruthy();
    for (const value of [1, 2, 3, 4, 5]) {
      expect(screen.getByTestId(`rating-star-${value}`)).toBeTruthy();
    }
  });

  it('Continue passes the selected rating', async () => {
    const onContinue = jest.fn();
    const screen = await render(<RatingSheet {...props} onContinue={onContinue} />);
    await fireEvent.press(screen.getByTestId('rating-star-4'));
    await fireEvent.press(screen.getByTestId('rating-continue'));
    expect(onContinue).toHaveBeenCalledWith(4);
  });

  it('disables Continue until a star is picked', async () => {
    const onContinue = jest.fn();
    const screen = await render(<RatingSheet {...props} onContinue={onContinue} />);

    expect(screen.getByTestId('rating-continue').props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId('rating-continue'));
    expect(onContinue).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('rating-star-1'));
    expect(screen.getByTestId('rating-continue').props.accessibilityState.disabled).toBe(false);
    await fireEvent.press(screen.getByTestId('rating-continue'));
    expect(onContinue).toHaveBeenCalledWith(1);
  });
});
