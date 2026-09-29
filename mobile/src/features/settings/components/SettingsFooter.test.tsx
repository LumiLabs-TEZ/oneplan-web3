import { render } from '@testing-library/react-native';

import { SettingsFooter } from './SettingsFooter';

describe('SettingsFooter', () => {
  it('renders the version and commit text', async () => {
    const screen = await render(
      <SettingsFooter versionLabel="Version 1.5.0 (42)" commit="c8057b1" />,
    );
    expect(screen.getByText('Version 1.5.0 (42)')).toBeTruthy();
    expect(screen.getByText('c8057b1')).toBeTruthy();
  });
});
