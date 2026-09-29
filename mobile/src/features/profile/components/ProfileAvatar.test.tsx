import { fireEvent, render, screen } from '@testing-library/react-native';

import { ProfileAvatar } from './ProfileAvatar';

describe('ProfileAvatar', () => {
  it('calls onPick when tapped', async () => {
    const onPick = jest.fn();
    await render(<ProfileAvatar uri={null} uploading={false} onPick={onPick} testID="avatar" />);
    await fireEvent.press(screen.getByTestId('avatar'));
    expect(onPick).toHaveBeenCalledTimes(1);
  });

  it('shows the uploading overlay and disables the picker while uploading', async () => {
    const onPick = jest.fn();
    await render(<ProfileAvatar uri={null} uploading onPick={onPick} testID="avatar" />);
    expect(screen.getByTestId('avatar-uploading')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('avatar'));
    expect(onPick).not.toHaveBeenCalled();
  });

  it('hides the overlay when not uploading', async () => {
    await render(<ProfileAvatar uri={null} uploading={false} onPick={jest.fn()} testID="avatar" />);
    expect(screen.queryByTestId('avatar-uploading')).toBeNull();
  });
});
