import { act, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';
import { useSettingsStore } from '@/stores/settingsStore';

import { CompareFeaturesSheet } from './CompareFeaturesSheet';

beforeAll(() => {
  initI18n();
});

describe('CompareFeaturesSheet', () => {
  afterEach(async () => {
    await act(async () => {
      useSettingsStore.setState({ language: 'en' });
    });
  });

  it('renders both section headers and every row title', async () => {
    const screen = await render(<CompareFeaturesSheet />);
    expect(screen.getByText('Unlock with Pro')).toBeTruthy();
    expect(screen.getByText('Included in all plans')).toBeTruthy();

    for (const title of [
      'Trips planning',
      'Extract pins by social video',
      'Upload plans on market',
      'Trip insights',
      'AI bill split',
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    for (const title of [
      'Create trips',
      'Build plans manual',
      'Unlimited boards',
      'Unlimited add friends',
      'Invite friends',
      'Trip passport',
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it('shows the Basic/Pro value text for the "unlock" rows', async () => {
    const screen = await render(<CompareFeaturesSheet />);
    expect(screen.getByText('Limited')).toBeTruthy();
    expect(screen.getByText('Unlimited')).toBeTruthy();
    expect(screen.getByText('Renewable')).toBeTruthy();
  });

  it('re-renders row titles and section headers in Vietnamese after a language switch', async () => {
    const screen = await render(<CompareFeaturesSheet />);
    expect(screen.getByText('Trips planning')).toBeTruthy();
    expect(screen.getByText('Unlock with Pro')).toBeTruthy();

    await act(async () => {
      useSettingsStore.setState({ language: 'vi' });
    });

    expect(screen.getByText('Lập kế hoạch chuyến đi')).toBeTruthy();
    expect(screen.getByText('Mở khóa với Pro')).toBeTruthy();
    expect(screen.queryByText('Trips planning')).toBeNull();
    expect(screen.queryByText('Unlock with Pro')).toBeNull();
  });
});
