import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Currency,
  ListingTag,
  Prisma,
  TripRequest,
  TripRequestStatus,
} from '@prisma/client';

export type TripRequestEntity = TripRequest & {
  user: { displayName: string; email: string };
  city: { name: string } | null;
  state: { name: string } | null;
  country: { name: string } | null;
  fulfilledByListing: { name: string; publicId: string } | null;
};

export const tripRequestInclude = {
  user: { select: { displayName: true, email: true } },
  city: { select: { name: true } },
  state: { select: { name: true } },
  country: { select: { name: true } },
  fulfilledByListing: { select: { name: true, publicId: true } },
} satisfies Prisma.TripRequestInclude;

export class TripRequestDto {
  @ApiProperty({ type: 'integer' })
  id: number;

  @ApiProperty({ enum: TripRequestStatus, enumName: 'TripRequestStatus' })
  status: TripRequestStatus;

  @ApiProperty({ enum: ListingTag, enumName: 'ListingTag' })
  tag: ListingTag;

  @ApiProperty({ nullable: true, type: String, description: 'Decimal budget' })
  budget: string | null;

  @ApiProperty({ enum: Currency, enumName: 'Currency' })
  currency: Currency;

  @ApiPropertyOptional({ type: 'integer' })
  participantCount: number | null;

  @ApiPropertyOptional({ type: 'integer' })
  dayCount: number | null;

  @ApiPropertyOptional()
  description: string | null;

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

  @ApiPropertyOptional({ type: 'integer' })
  fulfilledByListingId: number | null;

  @ApiPropertyOptional()
  fulfilledByListingName: string | null;

  @ApiPropertyOptional()
  fulfilledByListingPublicId: string | null;

  @ApiProperty()
  requesterName: string;

  @ApiProperty()
  requesterEmail: string;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  static fromEntity(entity: TripRequestEntity): TripRequestDto {
    const dto = new TripRequestDto();
    dto.id = entity.id;
    dto.status = entity.status;
    dto.tag = entity.tag;
    dto.budget = entity.budget?.toString() ?? null;
    dto.currency = entity.currency;
    dto.participantCount = entity.participantCount;
    dto.dayCount = entity.dayCount;
    dto.description = entity.description;
    dto.cityId = entity.cityId;
    dto.stateId = entity.stateId;
    dto.countryId = entity.countryId;
    dto.cityName = entity.city?.name ?? null;
    dto.stateName = entity.state?.name ?? null;
    dto.countryName = entity.country?.name ?? null;
    dto.fulfilledByListingId = entity.fulfilledByListingId;
    dto.fulfilledByListingName = entity.fulfilledByListing?.name ?? null;
    dto.fulfilledByListingPublicId =
      entity.fulfilledByListing?.publicId ?? null;
    dto.requesterName = entity.user.displayName;
    dto.requesterEmail = entity.user.email;
    dto.createdAt = entity.createdAt.toISOString();
    dto.updatedAt = entity.updatedAt.toISOString();
    return dto;
  }
}

export class TripRequestListDto {
  @ApiProperty({ type: [TripRequestDto] })
  items: TripRequestDto[];

  @ApiProperty({ type: 'integer' })
  total: number;
}
