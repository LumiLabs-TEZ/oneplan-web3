import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { MISSION_CLIENT_EVENTS, SHOP_ITEM_IDS } from '../mission-defs';
import type { MissionClientEvent, ShopItemId } from '../mission-defs';

// NOTE (iOS): every date in these DTOs is a plain ISO-8601 string produced by
// .toISOString() — never `format: date-time` (the swift-openapi-generator
// default transcoder rejects Prisma's fractional seconds).

export class MissionStateDto {
  @ApiProperty({ description: 'Mission id, e.g. "first_trip".' })
  missionId: string;

  @ApiProperty({
    description: 'Catalog group: getting_started | aha | community | rhythm.',
  })
  group: string;

  @ApiProperty({
    type: 'integer',
    description: 'Spark (⚡) awarded per completion.',
  })
  rewardAmount: number;

  @ApiProperty({
    description:
      'True when a one-time mission is done, or a capped mission is fully exhausted (friend_joined ×3, appstore_review).',
  })
  completed: boolean;

  @ApiProperty({
    type: String,
    nullable: true,
    description: 'ISO 8601 timestamp of the most recent completion.',
  })
  completedAt: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description:
      'Progress toward a multi-step mission (invite_2: distinct invitees; friend_joined: friends joined).',
  })
  progressCurrent: number | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Target for progressCurrent, when the mission has one.',
  })
  progressTarget: number | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description:
      'Completions consumed in the current cap period (week/month), for capped repeatable missions.',
  })
  periodUsed: number | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Cap per period (or lifetime for friend_joined).',
  })
  periodCap: number | null;
}

export class ShopItemStateDto {
  @ApiProperty({
    description:
      'Shop item id: scan_credit_1 | market_unlock | pro_7d | pro_30d.',
  })
  itemId: string;

  @ApiProperty({ type: 'integer', description: 'Price in spark (⚡).' })
  price: number;

  @ApiProperty({
    description: 'Reward kind: scan_credit | market_unlock | pro_days.',
  })
  rewardType: string;

  @ApiProperty({
    type: 'integer',
    description: 'Times the user has ever redeemed this item.',
  })
  redeemedCount: number;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description:
      'Redemptions consumed in the current quarter, for quarter-capped Pro items.',
  })
  periodUsed: number | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Redemptions allowed per quarter; null = unlimited.',
  })
  periodCap: number | null;

  @ApiProperty({
    description:
      'Whether the user can redeem this item right now (cap not exhausted; balance NOT considered).',
  })
  available: boolean;
}

export class MissionsOverviewDto {
  @ApiProperty({
    type: 'integer',
    description: 'Current spendable spark balance (earned − spent).',
  })
  balance: number;

  @ApiProperty({
    type: 'integer',
    description: 'Lifetime spark earned across all missions.',
  })
  totalEarned: number;

  @ApiProperty({ type: [MissionStateDto] })
  missions: MissionStateDto[];

  @ApiProperty({ type: [ShopItemStateDto] })
  shopItems: ShopItemStateDto[];
}

export class ReportMissionEventDto {
  @ApiProperty({
    enum: MISSION_CLIENT_EVENTS,
    description:
      'Client-reported mission event. Everything else is server-verified.',
  })
  @IsIn(MISSION_CLIENT_EVENTS as string[])
  event: MissionClientEvent;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Listing shared — required for market_shared.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  listingId?: number;

  @ApiPropertyOptional({
    description:
      'Where the missions sheet was opened from (home | onboarding | profile | push) — for missions_sheet_viewed.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;
}

export class ReportMissionEventResultDto {
  @ApiProperty({
    description: 'True when the report completed a mission and paid spark.',
  })
  awarded: boolean;

  @ApiProperty({ type: 'integer', description: 'Updated spark balance.' })
  balance: number;
}

export class RedeemRewardDto {
  @ApiProperty({
    enum: SHOP_ITEM_IDS,
    description: 'Shop item to redeem.',
  })
  @IsIn(SHOP_ITEM_IDS as string[])
  itemId: ShopItemId;

  @ApiPropertyOptional({
    type: 'integer',
    description: 'Listing to unlock — required for market_unlock.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  listingId?: number;
}

export class RedeemResultDto {
  @ApiProperty({ description: 'Redeemed shop item id.' })
  itemId: string;

  @ApiProperty({ type: 'integer', description: 'Spark spent.' })
  price: number;

  @ApiProperty({ type: 'integer', description: 'Balance after the redeem.' })
  newBalance: number;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description:
      'New Pro expiry (ISO 8601) after a pro_7d / pro_30d redemption.',
  })
  subscriptionExpiresAt: string | null;

  @ApiPropertyOptional({
    type: 'integer',
    nullable: true,
    description: 'Unlocked listing id after a market_unlock redemption.',
  })
  listingId: number | null;
}

// Error body returned with HTTP 402 when the user redeems above their balance.
// Mirrors InsufficientScanCreditsErrorDto's shape conventions.
export class InsufficientSparkErrorDto {
  @ApiProperty({ example: 'insufficient_spark' })
  code: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ type: 'integer' })
  balance: number;

  @ApiProperty({ type: 'integer' })
  price: number;
}
