import { render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { FriendsEmpty } from './FriendsEmpty';

beforeAll(() => {
  initI18n();
});

describe('FriendsEmpty', () => {
  it('renders the empty title and body', async () => {
    await render(<FriendsEmpty />);
    expect(screen.getByText('No friends yet')).toBeTruthy();
    expect(
      screen.getByText('Share your QR code or friend code to connect with others'),
    ).toBeTruthy();
  });
});
