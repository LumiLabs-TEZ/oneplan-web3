import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, TripStatus } from '@prisma/client';
import { TripMemberDto } from './trip-member.dto';

export class TripLocationDto {
  @ApiPropertyOptional({ type: 'integer' })
  cityId: number | null;

  @ApiPropertyOptional({ type: 'integer' })
  stateId: number | null;

  @ApiPropertyOptional({ type: 'integer' })
  countryId: number | null;

  @ApiPropertyOptional()
  cityName: string | null;

  @ApiPropertyOptional()
  stateName: string | null;

  @ApiPropertyOptional()
  countryName: string | null;

  @ApiPropertyOptional({ type: 'number' })
  latitude: number | null;

  @ApiPropertyOptional({ type: 'number' })
  longitude: number | null;
}

export class TripDto {
  @ApiProperty({ type: 'integer' })
  id: number;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  coverImageUrl: string | null;

  @ApiProperty({ enum: TripStatus, enumName: 'TripStatus' })
  status: TripStatus;

  @ApiPropertyOptional()
  startDate: string | null;

  @ApiPropertyOptional()
  endDate: string | null;

  @ApiPropertyOptional()
  inviteCode: string | null;

  @ApiProperty({ type: 'integer' })
  createdById: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty({ enum: Currency, enumName: 'Currency' })
  currency: Currency;

  @ApiProperty({
    enum: Currency,
    enumName: 'Currency',
    isArray: true,
    description: 'Additional local currencies used on the trip.',
  })
  localCurrencies: Currency[];

  @ApiPropertyOptional({ type: TripLocationDto })
  location: TripLocationDto | null;

  @ApiProperty({ nullable: true, type: Number })
  marketplaceListingId: number | null;

  @ApiProperty({ nullable: true, type: Number })
  userMarketplaceRating: number | null;

  @ApiProperty({ type: [TripMemberDto] })
  members: TripMemberDto[];

  @ApiPropertyOptional({
    type: 'boolean',
    description:
      'Present (and true) only on the immediate response of a currency change whose migration used a stale/fallback exchange rate. Never present on reads.',
  })
  rateStale?: boolean;
}
