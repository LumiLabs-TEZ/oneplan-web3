import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ContentLocale,
  Currency,
  ListingTag,
  MarketplaceListingStatus,
} from '@prisma/client';
import { MarketItemDto } from './market-item.dto';

export class MarketplaceListingDto {
  @ApiProperty({ type: 'integer' })
  id: number;

  @ApiProperty({
    description:
      'Opaque, non-enumerable public identifier used in user-visible URLs',
  })
  publicId: string;

  @ApiProperty({
    enum: MarketplaceListingStatus,
    enumName: 'MarketplaceListingStatus',
  })
  status: MarketplaceListingStatus;

  @ApiProperty({ type: 'integer' })
  createdById: number;

  @ApiProperty()
  creatorName: string;

  @ApiProperty({ nullable: true, type: String })
  creatorAvatarUrl: string | null;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({
    enum: ContentLocale,
    enumName: 'ContentLocale',
    description:
      'Language of the stored base text. `name`/`description`/item text are served in the Accept-Language locale when a translation exists, else in this language.',
  })
  sourceLocale: ContentLocale;

  @ApiProperty({
    enum: ContentLocale,
    enumName: 'ContentLocale',
    isArray: true,
    description:
      'Locales this listing can be served in (source + translations).',
  })
  availableLocales: ContentLocale[];

  @ApiPropertyOptional()
  coverImageUrl: string | null;

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

  @ApiProperty({ type: 'string', description: 'Decimal price' })
  price: string;

  @ApiProperty({ enum: Currency, enumName: 'Currency' })
  currency: Currency;

  @ApiProperty({ type: 'integer' })
  durationDays: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Google Play product identifier used for Android purchases',
  })
  playProductId: string | null;

  @ApiProperty({
    enum: ListingTag,
    enumName: 'ListingTag',
    isArray: true,
  })
  tags: ListingTag[];

  @ApiProperty({ type: 'integer' })
  appliedCount: number;

  @ApiProperty({ nullable: true, type: String })
  averageRating: string | null;

  @ApiProperty()
  ratingCount: number;

  @ApiProperty()
  createdAt: string;

  @ApiProperty()
  updatedAt: string;

  @ApiProperty({ type: [MarketItemDto] })
  items: MarketItemDto[];
}
