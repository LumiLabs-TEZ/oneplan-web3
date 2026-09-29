import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { LanguagePickerSheet } from './LanguagePickerSheet';

describe('LanguagePickerSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders both languages with their verbatim autonyms', async () => {
    const screen = await render(<LanguagePickerSheet value="en" onConfirm={jest.fn()} />);
    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Tiếng Việt')).toBeTruthy();
  });

  it('confirms the tapped language, not the initial value', async () => {
    const onConfirm = jest.fn();
    const screen = await render(<LanguagePickerSheet value="en" onConfirm={onConfirm} />);
    await fireEvent.press(screen.getByTestId('language-row-vi'));
    await fireEvent.press(screen.getByTestId('language-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('vi');
  });

  it('does not confirm when dismissed', async () => {
    const onConfirm = jest.fn();
    const screen = await render(<LanguagePickerSheet value="en" onConfirm={onConfirm} />);
    await fireEvent.press(screen.getByTestId('language-row-vi'));
    await fireEvent.press(screen.getByTestId('language-dismiss'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
