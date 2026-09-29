import { ApiProperty } from '@nestjs/swagger';

export class TractionSkuCountDto {
  @ApiProperty({ example: 'pro_monthly' })
  sku: string;

  @ApiProperty({ example: 12 })
  count: number;
}

export class TractionSubscriptionsDto {
  @ApiProperty({
    description:
      'Distinct users with an active entitlement (Pro sub statuses ACTIVE/GRACE_PERIOD/BILLING_RETRY, unioned with non-revoked pay_once buyers)',
  })
  active: number;

  @ApiProperty({ type: [TractionSkuCountDto] })
  bySku: TractionSkuCountDto[];
}

export class TractionPlaceCountDto {
  @ApiProperty({ example: 'Da Lat' })
  name: string;

  @ApiProperty({ example: 42 })
  trips: number;
}

export class TractionStatsDto {
  @ApiProperty()
  totalUsers: number;

  @ApiProperty()
  totalTrips: number;

  @ApiProperty({
    description:
      'First-time downloads: unique devices ever seen by app analytics (distinct anonymous/device ids)',
  })
  firstTimeDownloads: number;

  @ApiProperty({ type: TractionSubscriptionsDto })
  subscriptions: TractionSubscriptionsDto;

  @ApiProperty({ description: 'Approved (live) marketplace listings' })
  marketplacePlans: number;

  @ApiProperty({ type: [TractionPlaceCountDto] })
  topCities: TractionPlaceCountDto[];

  @ApiProperty({ type: [TractionPlaceCountDto] })
  topCountries: TractionPlaceCountDto[];

  @ApiProperty({ description: 'ISO timestamp the aggregates were computed at' })
  generatedAt: string;
}
