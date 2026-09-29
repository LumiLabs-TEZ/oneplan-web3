import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

// Posted by the iOS client after the user finishes watching a rewarded ad.
export class RewardedAdGrantRequestDto {
  @ApiProperty({
    description:
      'Client-generated UUID identifying one completed ad view. Retries with the same key are idempotent.',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  adKey: string;
}

export class RewardedAdGrantResponseDto {
  @ApiProperty({
    description:
      'True when the credit was granted (or the same adKey was already granted). False means the daily cap is exhausted.',
  })
  granted: boolean;

  @ApiProperty({
    type: 'integer',
    description: 'Rewarded-ad grants remaining today (UTC day), max 3.',
  })
  remainingToday: number;

  @ApiProperty({ type: 'integer' })
  available: number;

  @ApiProperty({ type: String, nullable: true })
  nextProGrantAt: string | null;
}
