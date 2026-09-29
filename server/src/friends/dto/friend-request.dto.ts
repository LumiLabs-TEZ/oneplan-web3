import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class FriendRequestSenderDto {
  @ApiProperty({ type: 'integer' })
  id: number;

  @ApiProperty()
  displayName: string;

  @ApiPropertyOptional()
  avatarUrl: string | null;

  @ApiProperty({ description: 'Whether user has active Pro subscription' })
  isPro: boolean;

  @ApiProperty({ description: 'Sender account creation date (ISO 8601)' })
  memberSince: string;
}

export class FriendRequestDto {
  @ApiProperty({ type: 'integer' })
  id: number;

  @ApiProperty({ type: FriendRequestSenderDto })
  sender: FriendRequestSenderDto;

  @ApiProperty({ type: 'integer' })
  mutualFriendCount: number;

  @ApiProperty()
  createdAt: string;
}
