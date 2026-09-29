import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TripStatus } from '@prisma/client';

export class InvitePreviewDto {
  @ApiProperty({ type: 'integer' })
  tripId: number;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  coverImageUrl: string | null;

  @ApiProperty({ type: 'integer' })
  memberCount: number;

  @ApiProperty({ enum: TripStatus, enumName: 'TripStatus' })
  status: TripStatus;

  @ApiProperty({
    description:
      'True only when the request is authenticated and that user is an ACCEPTED member of this trip. Always false for the unauthenticated web landing page.',
  })
  isMember: boolean;
}
