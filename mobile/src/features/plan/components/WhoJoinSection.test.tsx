import { fireEvent, render, screen } from '@testing-library/react-native';

import { initI18n } from '@/i18n';

import { WhoJoinSection } from './WhoJoinSection';
import type { components } from '@/api/schema';

type TripMemberDto = components['schemas']['TripMemberDto'];

const members = [
  { userId: 1, displayName: 'Alice' },
  { userId: 2, displayName: 'Bob' },
] as unknown as TripMemberDto[];

describe('WhoJoinSection', () => {
  beforeAll(() => {
    initI18n();
  });

  it('renders the All chip plus one chip per accepted member', async () => {
    await render(
      <WhoJoinSection
        acceptedMembers={members}
        members={{ all: true, ids: [] }}
        onToggleMember={jest.fn()}
        onSelectAll={jest.fn()}
      />,
    );
    expect(screen.getByTestId('plan-who-join-all')).toBeTruthy();
    expect(screen.getByTestId('plan-who-join-1')).toBeTruthy();
    expect(screen.getByTestId('plan-who-join-2')).toBeTruthy();
  });

  it('fires onToggleMember when a member chip is pressed', async () => {
    const onToggleMember = jest.fn();
    await render(
      <WhoJoinSection
        acceptedMembers={members}
        members={{ all: true, ids: [] }}
        onToggleMember={onToggleMember}
        onSelectAll={jest.fn()}
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-who-join-2'));
    expect(onToggleMember).toHaveBeenCalledWith(2);
  });

  it('fires onSelectAll when the All chip is pressed', async () => {
    const onSelectAll = jest.fn();
    await render(
      <WhoJoinSection
        acceptedMembers={members}
        members={{ all: false, ids: [1] }}
        onToggleMember={jest.fn()}
        onSelectAll={onSelectAll}
      />,
    );
    await fireEvent.press(screen.getByTestId('plan-who-join-all'));
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });
});
