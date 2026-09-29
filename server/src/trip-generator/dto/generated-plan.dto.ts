import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class GeneratedPlanItemDto {
  @ApiProperty({ description: '24h HH:MM start time' })
  time: string;

  @ApiProperty({ description: 'Plan name in the requested language' })
  name: string;

  @ApiProperty({
    description: 'Real venue name as it appears on the map; empty for transit',
  })
  placeName: string;

  @ApiProperty({ description: 'Full street address; empty for transit' })
  address: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ description: 'English image search query' })
  imageQuery: string;

  @ApiProperty({
    description:
      'Apple Maps link (place-id form when resolved); empty for transit',
  })
  mapLink: string;

  @ApiProperty({
    description:
      'True when the place was confidently resolved to a same-city Apple Maps location',
  })
  resolved: boolean;

  @ApiProperty({
    description:
      "The venue's real Apple Maps name when resolved, else empty. Used for accurate image search.",
  })
  resolvedName: string;

  @ApiPropertyOptional({
    type: 'number',
    description: 'Latitude from the Apple Maps lookup, when resolved',
  })
  latitude?: number;

  @ApiPropertyOptional({
    type: 'number',
    description: 'Longitude from the Apple Maps lookup, when resolved',
  })
  longitude?: number;
}

export class GeneratedPlanDayDto {
  @ApiProperty({ type: 'integer' })
  day: number;

  @ApiProperty({ type: [GeneratedPlanItemDto] })
  plans: GeneratedPlanItemDto[];
}

export class GeneratedTripPlanDto {
  @ApiProperty()
  tripName: string;

  @ApiProperty()
  tripDescription: string;

  @ApiProperty({ type: [GeneratedPlanDayDto] })
  days: GeneratedPlanDayDto[];
}

export class GenerateTripPlanResultDto {
  @ApiProperty({
    description: 'Handle for the CSV / images / create-listing endpoints',
  })
  id: string;

  @ApiProperty({ description: 'Gemini model that produced the plan' })
  model: string;

  @ApiProperty({ type: GeneratedTripPlanDto })
  plan: GeneratedTripPlanDto;
}

export class CreateListingFromPlanResultDto {
  @ApiProperty({ type: 'integer' })
  listingId: number;

  @ApiProperty({ description: 'Public share id of the created listing' })
  publicId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ type: 'integer', description: 'Number of plan items created' })
  itemCount: number;

  @ApiProperty({ type: 'integer', description: 'Number of images uploaded' })
  imageCount: number;
}

export class BackfillListingImagesResultDto {
  @ApiProperty({ type: 'integer' })
  listingId: number;

  @ApiProperty({
    type: 'integer',
    description: 'Items that had fewer than the requested minimum of images',
  })
  itemsChecked: number;

  @ApiProperty({
    type: 'integer',
    description: 'Items that received new images',
  })
  itemsUpdated: number;

  @ApiProperty({ type: 'integer', description: 'Images uploaded in total' })
  imagesAdded: number;

  @ApiProperty({
    type: 'integer',
    description:
      'Items whose byte-identical duplicate photos were removed (only with dedupe=true)',
  })
  itemsDeduped: number;

  @ApiProperty({
    type: 'integer',
    description:
      'Existing images removed by the vision re-check (only with recheck=true)',
  })
  imagesRemoved: number;
}

export class SyncListingImagesResultDto {
  @ApiProperty({ type: 'integer' })
  listingId: number;

  @ApiProperty({ type: 'integer' })
  sourceListingId: number;

  @ApiProperty({ type: 'integer', description: 'Items whose images changed' })
  itemsUpdated: number;

  @ApiProperty({
    type: 'integer',
    description: 'Images the target now carries',
  })
  imageCount: number;
}
