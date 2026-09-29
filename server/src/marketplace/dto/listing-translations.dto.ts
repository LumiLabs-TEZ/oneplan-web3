import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContentLocale } from '@prisma/client';

export class ListingTranslationTextDto {
  @ApiProperty({ enum: ContentLocale, enumName: 'ContentLocale' })
  locale: ContentLocale;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description: string | null;
}

export class ItemTranslationTextDto {
  @ApiProperty({ enum: ContentLocale, enumName: 'ContentLocale' })
  locale: ContentLocale;

  @ApiProperty()
  title: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description: string | null;
}

export class ListingTranslationItemDto {
  @ApiProperty({ type: 'integer' })
  itemId: number;

  @ApiProperty({ type: 'integer' })
  dayNumber: number;

  @ApiProperty({ type: 'integer' })
  sortOrder: number;

  @ApiProperty({ description: 'Base (source-locale) title' })
  title: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: [ItemTranslationTextDto] })
  translations: ItemTranslationTextDto[];
}

/** Admin view of a listing's base text plus every stored translation. */
export class ListingTranslationsDto {
  @ApiProperty({ type: 'integer' })
  listingId: number;

  @ApiProperty({ enum: ContentLocale, enumName: 'ContentLocale' })
  sourceLocale: ContentLocale;

  @ApiProperty({ description: 'Base (source-locale) name' })
  name: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description: string | null;

  @ApiProperty({ type: [ListingTranslationTextDto] })
  translations: ListingTranslationTextDto[];

  @ApiProperty({ type: [ListingTranslationItemDto] })
  items: ListingTranslationItemDto[];
}
