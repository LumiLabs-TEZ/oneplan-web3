import type { components } from '@/api/schema';

export type FriendDto = components['schemas']['FriendDto'];
export type FriendRequestDto = components['schemas']['FriendRequestDto'];
export type FriendPreviewDto = components['schemas']['FriendPreviewDto'];
export type FriendProfileDto = components['schemas']['FriendProfileDto'];
export type FriendRequestStatus = FriendPreviewDto['requestStatus'];
