import { fireEvent, render } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { TagPickerSheet } from './TagPickerSheet';

describe('TagPickerSheet', () => {
  beforeAll(() => {
    initI18n();
  });

  it('commits the draft only on the checkmark', async () => {
    const onConfirm = jest.fn();
    const screen = await render(<TagPickerSheet selected="FRIENDS" onConfirm={onConfirm} />);
    await fireEvent.press(screen.getByTestId('tag-row-SOLO'));
    expect(onConfirm).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('tag-confirm'));
    expect(onConfirm).toHaveBeenCalledWith('SOLO');
  });

  it('dismiss discards the draft', async () => {
    const onConfirm = jest.fn();
    const screen = await render(<TagPickerSheet selected="FRIENDS" onConfirm={onConfirm} />);
    await fireEvent.press(screen.getByTestId('tag-row-FAMILY'));
    await fireEvent.press(screen.getByTestId('tag-dismiss'));
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
