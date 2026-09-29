import type { components } from '@/api/schema';

type TripMemberDto = components['schemas']['TripMemberDto'];

export function member(userId: number, overrides: Partial<TripMemberDto> = {}): TripMemberDto {
  return {
    id: userId * 10,
    userId,
    displayName: `Member ${userId}`,
    avatarUrl: null,
    inviteStatus: 'ACCEPTED',
    role: 'MEMBER',
    isPro: false,
    ...overrides,
  };
}

export const testMembers: TripMemberDto[] = [
  member(1, { displayName: 'Ken' }),
  member(2, { displayName: 'Linh' }),
  member(3, { displayName: 'Pending', inviteStatus: 'PENDING' }),
];
