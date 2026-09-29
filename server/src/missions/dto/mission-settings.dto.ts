import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { MISSION_IDS, SHOP_ITEM_IDS } from '../mission-defs';

// Admin settings surface for the mission/shop numbers (web/admin only).
// Effective value + code default + overridden flag per editable field; the
// id set and reward mechanics (proDays/creditAmount) are read-only context.

export class MissionSettingDto {
  @ApiProperty({ enum: [...MISSION_IDS] })
  id: string;

  @ApiProperty()
  group: string;

  @ApiProperty({ description: 'Effective reward (override or default).' })
  reward: number;

  @ApiProperty()
  defaultReward: number;

  @ApiProperty()
  rewardOverridden: boolean;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Effective cap; null = uncapped one-time mission.',
  })
  cap: number | null;

  @ApiProperty({ type: 'integer', nullable: true })
  defaultCap: number | null;

  @ApiProperty()
  capOverridden: boolean;

  @ApiProperty({
    type: 'string',
    nullable: true,
    description: "Cap period: 'week' | 'month' | 'lifetime' | null.",
  })
  capPeriod: string | null;
}

export class ShopItemSettingDto {
  @ApiProperty({ enum: [...SHOP_ITEM_IDS] })
  id: string;

  @ApiProperty()
  rewardType: string;

  @ApiProperty({ description: 'Effective spark price (override or default).' })
  price: number;

  @ApiProperty()
  defaultPrice: number;

  @ApiProperty()
  priceOverridden: boolean;

  @ApiProperty({ type: 'integer', nullable: true })
  capPerQuarter: number | null;

  @ApiProperty({ type: 'integer', nullable: true })
  defaultCapPerQuarter: number | null;

  @ApiProperty()
  capPerQuarterOverridden: boolean;

  @ApiProperty({
    type: 'integer',
    nullable: true,
    description: 'Code-owned (not editable) — shown for context.',
  })
  proDays: number | null;

  @ApiProperty({ type: 'integer', nullable: true })
  creditAmount: number | null;
}

export class MissionSettingsDto {
  @ApiProperty({ type: [MissionSettingDto] })
  missions: MissionSettingDto[];

  @ApiProperty({ type: [ShopItemSettingDto] })
  shopItems: ShopItemSettingDto[];
}

// ── Update ─────────────────────────────────────────────────────────────────
// Partial per-row updates; an explicit null resets that field to the code
// default. Cap fields are ignored for missions/items uncapped in code.

export class UpdateMissionSettingDto {
  @ApiProperty({ enum: [...MISSION_IDS] })
  @IsIn(MISSION_IDS)
  id: string;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  reward?: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  cap?: number | null;
}

export class UpdateShopItemSettingDto {
  @ApiProperty({ enum: [...SHOP_ITEM_IDS] })
  @IsIn(SHOP_ITEM_IDS)
  id: string;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  price?: number | null;

  @ApiPropertyOptional({ type: 'integer', nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(20)
  capPerQuarter?: number | null;
}

export class UpdateMissionSettingsDto {
  @ApiPropertyOptional({ type: [UpdateMissionSettingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateMissionSettingDto)
  missions?: UpdateMissionSettingDto[];

  @ApiPropertyOptional({ type: [UpdateShopItemSettingDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpdateShopItemSettingDto)
  shopItems?: UpdateShopItemSettingDto[];
}
