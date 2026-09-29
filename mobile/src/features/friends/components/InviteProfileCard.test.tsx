import { render } from '@testing-library/react-native';

import { InviteProfileCard } from './InviteProfileCard';

describe('InviteProfileCard', () => {
  it('renders the display name and invite note', async () => {
    const screen = await render(<InviteProfileCard name="Ken Nguyen" avatarUrl={null} />);
    expect(screen.getByText('Ken Nguyen')).toBeTruthy();
    expect(screen.getByText('Hey! Let’s add friend and travel together.')).toBeTruthy();
  });

  it('falls back to "One Plan User" when name is missing', async () => {
    const screen = await render(<InviteProfileCard name={undefined} avatarUrl={null} />);
    expect(screen.getByText('One Plan User')).toBeTruthy();
  });

  it('falls back to "One Plan User" when name is an empty string', async () => {
    const screen = await render(<InviteProfileCard name="" avatarUrl={null} />);
    expect(screen.getByText('One Plan User')).toBeTruthy();
  });
});
