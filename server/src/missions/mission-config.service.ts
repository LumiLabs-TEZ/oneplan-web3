import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  MISSION_DEFS,
  MISSION_IDS,
  MissionDef,
  MissionId,
  SHOP_ITEM_IDS,
  SHOP_ITEMS,
  ShopItemDef,
  ShopItemId,
} from './mission-defs';
import {
  MissionSettingsDto,
  UpdateMissionSettingsDto,
} from './dto/mission-settings.dto';

// Short safety-net TTL. The cache is busted on every write, so this only
// matters for other server instances (config propagates within a minute).
const CACHE_TTL_MS = 60_000;

const missionKey = (id: MissionId, field: 'reward' | 'cap') =>
  `mission.${id}.${field}`;
const shopKey = (id: ShopItemId, field: 'price' | 'capPerQuarter') =>
  `shop.${id}.${field}`;

export interface EffectiveDefs {
  missions: Record<MissionId, MissionDef>;
  shopItems: Record<ShopItemId, ShopItemDef>;
}

// Resolves the admin-editable mission/shop numbers with precedence
// DB override > mission-defs.ts constant (no env layer — the defs never had
// env vars). Only `reward`/`cap` (missions) and `price`/`capPerQuarter`
// (shop items) are overridable; ids and reward mechanics (proDays,
// creditAmount, proProductId) stay code-owned — iOS card copy and the DTO
// @IsIn enums depend on them.
@Injectable()
export class MissionConfigService {
  private cache: Map<string, string> | null = null;
  private cachedAt = 0;

  constructor(private readonly prisma: PrismaService) {}

  async getEffectiveDefs(): Promise<EffectiveDefs> {
    const rows = await this.load();

    const missions = {} as Record<MissionId, MissionDef>;
    for (const id of MISSION_IDS) {
      const def = { ...MISSION_DEFS[id] };
      const reward = readInt(rows.get(missionKey(id, 'reward')));
      if (reward != null) def.reward = reward;
      // A cap override only applies to missions that are capped in code —
      // one-time missions rely on the partial unique index, not cap counting.
      if (def.cap != null) {
        const cap = readInt(rows.get(missionKey(id, 'cap')));
        if (cap != null) def.cap = cap;
      }
      missions[id] = def;
    }

    const shopItems = {} as Record<ShopItemId, ShopItemDef>;
    for (const id of SHOP_ITEM_IDS) {
      const def = { ...SHOP_ITEMS[id] };
      const price = readInt(rows.get(shopKey(id, 'price')));
      if (price != null && price >= 1) def.price = price;
      if (def.capPerQuarter != null) {
        const cap = readInt(rows.get(shopKey(id, 'capPerQuarter')));
        if (cap != null) def.capPerQuarter = cap;
      }
      shopItems[id] = def;
    }

    return { missions, shopItems };
  }

  // Effective + default + overridden flags for the admin settings page.
  async getAdminView(): Promise<MissionSettingsDto> {
    const rows = await this.load();
    const { missions, shopItems } = await this.getEffectiveDefs();
    return {
      missions: MISSION_IDS.map((id) => {
        const def = missions[id];
        const base = MISSION_DEFS[id];
        return {
          id,
          group: def.group,
          reward: def.reward,
          defaultReward: base.reward,
          rewardOverridden: rows.has(missionKey(id, 'reward')),
          cap: def.cap ?? null,
          defaultCap: base.cap ?? null,
          capOverridden: rows.has(missionKey(id, 'cap')),
          capPeriod: base.capPeriod ?? null,
        };
      }),
      shopItems: SHOP_ITEM_IDS.map((id) => {
        const def = shopItems[id];
        const base = SHOP_ITEMS[id];
        return {
          id,
          rewardType: base.rewardType,
          price: def.price,
          defaultPrice: base.price,
          priceOverridden: rows.has(shopKey(id, 'price')),
          capPerQuarter: def.capPerQuarter ?? null,
          defaultCapPerQuarter: base.capPerQuarter ?? null,
          capPerQuarterOverridden: rows.has(shopKey(id, 'capPerQuarter')),
          proDays: base.proDays ?? null,
          creditAmount: base.creditAmount ?? null,
        };
      }),
    };
  }

  // Partial update; an explicit null resets that key to the code default
  // (deletes the row). Cap overrides on missions/items that are uncapped in
  // code are ignored (nothing to count against).
  async update(dto: UpdateMissionSettingsDto): Promise<MissionSettingsDto> {
    const upserts: { key: string; value: string }[] = [];
    const deletes: string[] = [];

    for (const m of dto.missions ?? []) {
      const id = m.id as MissionId;
      collect(upserts, deletes, missionKey(id, 'reward'), m.reward);
      if (MISSION_DEFS[id].cap != null) {
        collect(upserts, deletes, missionKey(id, 'cap'), m.cap);
      }
    }
    for (const s of dto.shopItems ?? []) {
      const id = s.id as ShopItemId;
      collect(upserts, deletes, shopKey(id, 'price'), s.price);
      if (SHOP_ITEMS[id].capPerQuarter != null) {
        collect(
          upserts,
          deletes,
          shopKey(id, 'capPerQuarter'),
          s.capPerQuarter,
        );
      }
    }

    for (const w of upserts) {
      await this.prisma.missionSetting.upsert({
        where: { key: w.key },
        create: w,
        update: { value: w.value },
      });
    }
    if (deletes.length) {
      await this.prisma.missionSetting.deleteMany({
        where: { key: { in: deletes } },
      });
    }

    this.cache = null; // bust so the next read reflects the write
    return this.getAdminView();
  }

  private async load(): Promise<Map<string, string>> {
    const now = Date.now();
    if (this.cache && now - this.cachedAt < CACHE_TTL_MS) return this.cache;
    const rows = await this.prisma.missionSetting.findMany();
    this.cache = new Map(rows.map((r) => [r.key, r.value]));
    this.cachedAt = now;
    return this.cache;
  }
}

// Defensive parse: a hand-edited/corrupt row must fall back to the code
// default, never NaN a price into the ledger.
function readInt(raw: string | undefined): number | null {
  if (raw == null) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function collect(
  upserts: { key: string; value: string }[],
  deletes: string[],
  key: string,
  value: number | null | undefined,
): void {
  if (value === undefined) return;
  if (value === null) deletes.push(key);
  else upserts.push({ key, value: String(value) });
}
