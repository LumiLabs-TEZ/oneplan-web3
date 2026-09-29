import { fireEvent, render } from '@testing-library/react-native';

import { testMembers } from '@/features/expense/components/testMembers';
import { initI18n } from '@/i18n';

import { ContributorChips } from './ContributorChips';

describe('ContributorChips', () => {
  beforeAll(() => {
    initI18n();
  });

  it('narrows "all" to a single member on tap', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <ContributorChips members={testMembers} contributors="all" onChange={onChange} />,
    );
    await fireEvent.press(screen.getByTestId('contributor-chip-2'));
    expect(onChange).toHaveBeenCalledWith({ ids: [2] });
  });

  it('falls back to "all" when the last selected member is deselected', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <ContributorChips members={testMembers} contributors={{ ids: [2] }} onChange={onChange} />,
    );
    await fireEvent.press(screen.getByTestId('contributor-chip-2'));
    expect(onChange).toHaveBeenCalledWith('all');
  });

  it('resets to "all" via the All chip and respects a custom testID prefix', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <ContributorChips
        members={testMembers}
        contributors={{ ids: [1] }}
        onChange={onChange}
        testIDPrefix="edit-contributor-chip"
      />,
    );
    await fireEvent.press(screen.getByTestId('edit-contributor-chip-all'));
    expect(onChange).toHaveBeenCalledWith('all');
  });
});
