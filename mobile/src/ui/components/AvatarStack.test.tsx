import { fireEvent, render, screen } from '@testing-library/react-native';

import { AvatarStack } from './AvatarStack';

const members = [
  { id: 1, avatarUrl: 'https://cdn.example.com/1.jpg?sig=a' },
  { id: 2, avatarUrl: null },
  { id: 3 },
  { id: 4, avatarUrl: 'https://cdn.example.com/4.jpg' },
  { id: 5, avatarUrl: 'https://cdn.example.com/5.jpg' },
];

describe('AvatarStack (OngoingCard.swift parity)', () => {
  it('renders at most `max` avatars and a "+N" remainder', async () => {
    await render(<AvatarStack members={members} />);
    expect(screen.getAllByTestId('avatar-stack-item')).toHaveLength(3);
    expect(screen.getByTestId('avatar-stack-remaining')).toHaveTextContent('+2');
  });

  it('omits the remainder when everyone fits', async () => {
    await render(<AvatarStack members={members.slice(0, 2)} max={3} />);
    expect(screen.getAllByTestId('avatar-stack-item')).toHaveLength(2);
    expect(screen.queryByTestId('avatar-stack-remaining')).toBeNull();
  });

  it('falls back to the placeholder for members without an avatar', async () => {
    await render(<AvatarStack members={members} />);
    expect(screen.getAllByTestId('avatar-placeholder')).toHaveLength(2);
  });

  it('always shows the dashed "+" chip and forwards onAddPress', async () => {
    const onAddPress = jest.fn();
    await render(<AvatarStack members={[]} onAddPress={onAddPress} />);
    const chip = screen.getByTestId('avatar-stack-add');
    expect(chip).toHaveStyle({ borderStyle: 'dashed' });
    await fireEvent.press(chip);
    expect(onAddPress).toHaveBeenCalledTimes(1);
  });
});
