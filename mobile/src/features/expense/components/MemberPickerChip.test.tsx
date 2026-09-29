import { fireEvent, render } from '@testing-library/react-native';

import { colors } from '@/ui/theme';

import { MemberPickerChip } from './MemberPickerChip';
import { member } from './testMembers';

function flatten(style: unknown): Record<string, unknown> {
  return Object.assign({}, ...(Array.isArray(style) ? style.flat(Infinity) : [style]));
}

describe('MemberPickerChip', () => {
  it('renders the member name and fires onPress', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <MemberPickerChip
        member={member(1, { displayName: 'Ken' })}
        selected={false}
        accent="blue"
        onPress={onPress}
        testID="chip"
      />,
    );
    expect(screen.getByText('Ken')).toBeTruthy();
    expect(screen.getByTestId('chip').props.accessibilityState.selected).toBe(false);
    await fireEvent.press(screen.getByTestId('chip'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('rings the badge and tints the name in the accent colour when selected', async () => {
    const screen = await render(
      <MemberPickerChip
        member={member(1, { displayName: 'Ken' })}
        selected
        accent="orange"
        onPress={jest.fn()}
        testID="chip"
      />,
    );
    expect(screen.getByTestId('chip').props.accessibilityState.selected).toBe(true);
    expect(flatten(screen.getByTestId('chip-ring').props.style).borderColor).toBe(
      colors.warning500,
    );
    expect(flatten(screen.getByText('Ken').props.style).color).toBe(colors.warning500);
  });

  it('leaves the ring clear and the name muted when not selected', async () => {
    const screen = await render(
      <MemberPickerChip
        member={member(1, { displayName: 'Ken' })}
        selected={false}
        accent="blue"
        onPress={jest.fn()}
        testID="chip"
      />,
    );
    expect(flatten(screen.getByTestId('chip-ring').props.style).borderColor).toBe('transparent');
    expect(flatten(screen.getByText('Ken').props.style).color).toBe(colors.contentM);
  });

  it('renders a labelled group chip without a member and ignores presses when disabled', async () => {
    const onPress = jest.fn();
    const screen = await render(
      <MemberPickerChip
        label="All"
        selected
        accent="blue"
        onPress={onPress}
        disabled
        testID="chip"
      />,
    );
    expect(screen.getByText('All')).toBeTruthy();
    expect(screen.queryByTestId('avatar-placeholder')).toBeNull();
    await fireEvent.press(screen.getByTestId('chip'));
    expect(onPress).not.toHaveBeenCalled();
  });
});
