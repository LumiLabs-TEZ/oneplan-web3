import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { initI18n } from '@/i18n';
import { TripVibeSheet } from './TripVibeSheet';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
jest.mock('./common', () => ({
  ...jest.requireActual('./common'),
  BoardSheet: ({ children, footer }: { children: ReactNode; footer?: ReactNode }) => (
    <>
      {children}
      {footer}
    </>
  ),
}));
const isSelected = (testID: string) =>
  screen.getByTestId(testID).props.accessibilityState?.selected === true;
it('treats "Surprise me" as the exclusive empty selection and confirms in canonical order', async () => {
  initI18n();
  const confirm = jest.fn();
  await render(<TripVibeSheet selected={[]} onConfirm={confirm} onClose={() => undefined} />);
  expect(isSelected('trip-vibe-surprise')).toBe(true);
  await fireEvent.press(screen.getByTestId('trip-vibe-SHOPPING'));
  await fireEvent.press(screen.getByTestId('trip-vibe-FOOD_TOUR'));
  expect(isSelected('trip-vibe-surprise')).toBe(false);
  expect(isSelected('trip-vibe-FOOD_TOUR')).toBe(true);
  await fireEvent.press(screen.getByTestId('trip-vibe-confirm'));
  expect(confirm).toHaveBeenLastCalledWith(['FOOD_TOUR', 'SHOPPING']);
  await fireEvent.press(screen.getByTestId('trip-vibe-FOOD_TOUR'));
  await fireEvent.press(screen.getByTestId('trip-vibe-confirm'));
  expect(confirm).toHaveBeenLastCalledWith(['SHOPPING']);
  await fireEvent.press(screen.getByTestId('trip-vibe-surprise'));
  expect(isSelected('trip-vibe-SHOPPING')).toBe(false);
  expect(isSelected('trip-vibe-surprise')).toBe(true);
  await fireEvent.press(screen.getByTestId('trip-vibe-confirm'));
  expect(confirm).toHaveBeenLastCalledWith([]);
});
it('starts from the previous selection', async () => {
  initI18n();
  await render(
    <TripVibeSheet selected={['NIGHTLIFE']} onConfirm={jest.fn()} onClose={() => undefined} />,
  );
  expect(isSelected('trip-vibe-NIGHTLIFE')).toBe(true);
  expect(isSelected('trip-vibe-surprise')).toBe(false);
});
