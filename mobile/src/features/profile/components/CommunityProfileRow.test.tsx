import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import { CommunityProfileRow } from './CommunityProfileRow';
jest.mock('expo-router', () => ({ router: { push: jest.fn() } }));
it('opens the creator profile', async () => {
  await render(<CommunityProfileRow testID="row" />);
  await fireEvent.press(screen.getByTestId('row'));
  expect(router.push).toHaveBeenCalledWith('/market/owner');
});
