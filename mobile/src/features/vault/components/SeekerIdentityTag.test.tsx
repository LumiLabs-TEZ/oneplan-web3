import { render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { SeekerIdentityTag } from './SeekerIdentityTag';

beforeAll(() => {
  initI18n();
});

it('shows the .skr name and a Seeker pill', async () => {
  const screen = await render(
    <SeekerIdentityTag skrDomain="alice" isSeeker fallback="Ab12...9xYz" />,
  );
  expect(screen.getByText('alice.skr')).toBeTruthy();
  expect(screen.getByTestId('seeker-badge')).toBeTruthy();
});

it('falls back when there is no .skr name, and hides the pill for non-Seekers', async () => {
  const screen = await render(
    <SeekerIdentityTag skrDomain={null} isSeeker={false} fallback="Ab12...9xYz" />,
  );
  expect(screen.getByText('Ab12...9xYz')).toBeTruthy();
  expect(screen.queryByTestId('seeker-badge')).toBeNull();
});

it('renders nothing with no name, no fallback and no badge', async () => {
  const screen = await render(
    <SeekerIdentityTag skrDomain={null} isSeeker={false} fallback={null} />,
  );
  expect(screen.toJSON()).toBeNull();
});
