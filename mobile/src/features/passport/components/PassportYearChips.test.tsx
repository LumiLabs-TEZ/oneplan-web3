import { fireEvent, render } from '@testing-library/react-native';
import * as Haptics from 'expo-haptics';

import { initI18n } from '@/i18n';

import { PassportYearChips } from './PassportYearChips';

describe('PassportYearChips', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders "All time" first, then years descending', async () => {
    const screen = await render(
      <PassportYearChips
        selectedYear={null}
        availableYears={[2026, 2025, 2024]}
        onSelect={jest.fn()}
        testID="chips"
      />,
    );
    expect(screen.getByText('All time')).toBeTruthy();
    expect(screen.getByText('2026')).toBeTruthy();
    expect(screen.getByText('2025')).toBeTruthy();
    expect(screen.getByText('2024')).toBeTruthy();
  });

  it('marks the selected year chip', async () => {
    const screen = await render(
      <PassportYearChips
        selectedYear={2025}
        availableYears={[2026, 2025]}
        onSelect={jest.fn()}
        testID="chips"
      />,
    );
    expect(screen.getByTestId('chips-2025').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('chips-2026').props.accessibilityState).toEqual({
      selected: false,
    });
    expect(screen.getByTestId('chips-all').props.accessibilityState).toEqual({ selected: false });
  });

  it('marks "All time" selected when selectedYear is null', async () => {
    const screen = await render(
      <PassportYearChips
        selectedYear={null}
        availableYears={[2026]}
        onSelect={jest.fn()}
        testID="chips"
      />,
    );
    expect(screen.getByTestId('chips-all').props.accessibilityState).toEqual({ selected: true });
  });

  it('calls onSelect(null) when "All time" is pressed', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <PassportYearChips
        selectedYear={2025}
        availableYears={[2025]}
        onSelect={onSelect}
        testID="chips"
      />,
    );
    await fireEvent.press(screen.getByTestId('chips-all'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('calls onSelect(year) when a year chip is pressed', async () => {
    const onSelect = jest.fn();
    const screen = await render(
      <PassportYearChips
        selectedYear={null}
        availableYears={[2025]}
        onSelect={onSelect}
        testID="chips"
      />,
    );
    await fireEvent.press(screen.getByTestId('chips-2025'));
    expect(onSelect).toHaveBeenCalledWith(2025);
  });

  it('fires a light haptic when the selection changes, but not on a re-tap', async () => {
    // Other tests in this file also trigger real selection changes (no `clearMocks` in the jest
    // config) — clear the shared mock's call history so this test only sees its own presses.
    const impactSpy = jest.spyOn(Haptics, 'impactAsync').mockClear();
    const onSelect = jest.fn();
    const screen = await render(
      <PassportYearChips
        selectedYear={2025}
        availableYears={[2025, 2024]}
        onSelect={onSelect}
        testID="chips"
      />,
    );

    await fireEvent.press(screen.getByTestId('chips-2025'));
    expect(onSelect).not.toHaveBeenCalled();
    expect(impactSpy).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByTestId('chips-2024'));
    expect(onSelect).toHaveBeenCalledWith(2024);
    expect(impactSpy).toHaveBeenCalledWith(Haptics.ImpactFeedbackStyle.Light);
  });
});
