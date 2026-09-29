import { fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { pendingInvitesStore, usePendingInvitesStore } from '@/features/invite/pendingInvitesStore';
import type { PendingInvite } from '@/features/invite/types';
import { initI18n } from '@/i18n';

import { InvitationBanner } from './InvitationBanner';

const mockMutate = jest.fn();
jest.mock('@/features/invite/api/declineInvite', () => ({
  useDeclineInvite: () => ({ mutate: mockMutate }),
}));

const A: PendingInvite = {
  inviteCode: 'AAA',
  tripName: 'Da Lat weekend',
  coverImageUrl: 'https://cdn.example.com/cover.jpg',
  invitedByDisplayName: 'Ken',
};
const B: PendingInvite = {
  inviteCode: 'BBB',
  tripName: 'Hanoi trip',
  coverImageUrl: null,
  invitedByDisplayName: '',
};

beforeAll(() => {
  initI18n();
});

beforeEach(() => {
  pendingInvitesStore.reset();
});

describe('InvitationBanner', () => {
  it('renders null when there are no pending invites', async () => {
    await render(<InvitationBanner />);
    expect(screen.toJSON()).toBeNull();
  });

  it("renders the first invite's inviter name and trip name", async () => {
    pendingInvitesStore.upsert(A, 'websocket');
    pendingInvitesStore.upsert(B, 'api');

    await render(<InvitationBanner />);

    expect(screen.getByText('Ken invited you to')).toBeTruthy();
    expect(screen.getByText('Da Lat weekend')).toBeTruthy();
    expect(screen.queryByText('Hanoi trip')).toBeNull();
  });

  it('stacks the waiting invites behind the front card with a +N badge', async () => {
    const C: PendingInvite = { ...B, inviteCode: 'CCC', tripName: 'Hue trip' };
    pendingInvitesStore.upsert(A, 'websocket');
    pendingInvitesStore.upsert(B, 'api');
    pendingInvitesStore.upsert(C, 'api');

    await render(<InvitationBanner />);

    expect(screen.getByText('Da Lat weekend')).toBeTruthy();
    expect(screen.getByTestId('invitation-banner-stack-badge')).toHaveTextContent('+2');
    expect(screen.getAllByTestId('invitation-banner-stack-depth')).toHaveLength(2);

    mockMutate.mockReset();
    await fireEvent.press(screen.getByTestId('invitation-banner-dismiss'));

    expect(screen.getByText('Hanoi trip')).toBeTruthy();
    expect(screen.getByTestId('invitation-banner-stack-badge')).toHaveTextContent('+1');
  });

  it('shows no badge for a single invite', async () => {
    pendingInvitesStore.upsert(A, 'websocket');

    await render(<InvitationBanner />);

    expect(screen.queryByTestId('invitation-banner-stack-badge')).toBeNull();
  });

  it('falls back to the empty-inviter headline when invitedByDisplayName is empty', async () => {
    pendingInvitesStore.upsert(B, 'api');

    await render(<InvitationBanner />);

    expect(screen.getByText('You’ve got an invitation to')).toBeTruthy();
  });

  it('pressing "View" presents the invite', async () => {
    pendingInvitesStore.upsert(A, 'websocket');
    await render(<InvitationBanner />);

    await fireEvent.press(screen.getByTestId('invitation-banner-view'));

    expect(usePendingInvitesStore.getState().activeCode).toBe('AAA');
  });

  it('pressing the trash icon removes the invite and declines it on the server', async () => {
    mockMutate.mockReset();
    pendingInvitesStore.upsert(A, 'websocket');
    await render(<InvitationBanner />);

    await fireEvent.press(screen.getByTestId('invitation-banner-dismiss'));

    expect(usePendingInvitesStore.getState().invites).toEqual([]);
    expect(mockMutate).toHaveBeenCalledWith('AAA', expect.any(Object));
  });

  it('restores the invite when the decline fails', async () => {
    mockMutate.mockReset();
    mockMutate.mockImplementation((_code: string, opts: { onError: (e: Error) => void }) =>
      opts.onError(new Error('boom')),
    );
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    pendingInvitesStore.upsert(A, 'websocket');
    await render(<InvitationBanner />);

    await fireEvent.press(screen.getByTestId('invitation-banner-dismiss'));

    expect(usePendingInvitesStore.getState().invites).toEqual([A]);
    expect(alertSpy).toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});
