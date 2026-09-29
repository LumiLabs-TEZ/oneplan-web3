import { fireEvent, render } from '@testing-library/react-native';

import { SegmentedToggle } from './SegmentedToggle';

const OPTIONS = [
  { value: 'personal', label: 'Personal' },
  { value: 'group', label: 'Group' },
] as const;

describe('SegmentedToggle', () => {
  it('fires onChange when a different option is pressed', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <SegmentedToggle options={OPTIONS} value="personal" onChange={onChange} testID="scope" />,
    );
    await fireEvent.press(screen.getByTestId('scope-group'));
    expect(onChange).toHaveBeenCalledWith('group');
  });

  it('does not fire onChange when the already-selected option is pressed', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <SegmentedToggle options={OPTIONS} value="personal" onChange={onChange} testID="scope" />,
    );
    await fireEvent.press(screen.getByTestId('scope-personal'));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('marks the active option as selected for accessibility', async () => {
    const screen = await render(
      <SegmentedToggle options={OPTIONS} value="group" onChange={jest.fn()} testID="scope" />,
    );
    expect(screen.getByTestId('scope-group').props.accessibilityState).toEqual({ selected: true });
    expect(screen.getByTestId('scope-personal').props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it('segmented variant switches options and draws the thumb once the track is measured', async () => {
    const onChange = jest.fn();
    const screen = await render(
      <SegmentedToggle
        options={OPTIONS}
        value="personal"
        onChange={onChange}
        variant="segmented"
        testID="scope"
      />,
    );
    await fireEvent(screen.getByTestId('scope'), 'layout', {
      nativeEvent: { layout: { width: 204, height: 36, x: 0, y: 0 } },
    });
    await fireEvent.press(screen.getByTestId('scope-group'));
    expect(onChange).toHaveBeenCalledWith('group');
    expect(screen.getByTestId('scope-personal').props.accessibilityState).toEqual({
      selected: true,
    });
  });
});
