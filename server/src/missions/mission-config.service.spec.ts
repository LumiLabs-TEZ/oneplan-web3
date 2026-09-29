import { PrismaService } from '../prisma/prisma.service';
import { MissionConfigService } from './mission-config.service';
import { MISSION_DEFS, SHOP_ITEMS } from './mission-defs';

describe('MissionConfigService', () => {
  let findMany: jest.Mock;
  let upsert: jest.Mock;
  let deleteMany: jest.Mock;
  let service: MissionConfigService;

  const setRows = (rows: { key: string; value: string }[]) =>
    findMany.mockResolvedValue(rows);

  beforeEach(() => {
    findMany = jest.fn().mockResolvedValue([]);
    upsert = jest.fn().mockResolvedValue({});
    deleteMany = jest.fn().mockResolvedValue({ count: 0 });
    const prisma = {
      missionSetting: { findMany, upsert, deleteMany },
    } as unknown as PrismaService;
    service = new MissionConfigService(prisma);
  });

  it('returns code defaults when no overrides exist', async () => {
    const { missions, shopItems } = await service.getEffectiveDefs();
    expect(missions.first_trip.reward).toBe(MISSION_DEFS.first_trip.reward);
    expect(shopItems.pro_7d.price).toBe(SHOP_ITEMS.pro_7d.price);
    expect(shopItems.pro_7d.capPerQuarter).toBe(
      SHOP_ITEMS.pro_7d.capPerQuarter,
    );
  });

  it('applies overrides over defaults (only editable fields)', async () => {
    setRows([
      { key: 'mission.first_trip.reward', value: '25' },
      { key: 'mission.rate_plan.cap', value: '5' },
      { key: 'shop.pro_7d.price', value: '200' },
      { key: 'shop.pro_7d.capPerQuarter', value: '4' },
    ]);
    const { missions, shopItems } = await service.getEffectiveDefs();
    expect(missions.first_trip.reward).toBe(25);
    expect(missions.rate_plan.cap).toBe(5);
    expect(shopItems.pro_7d.price).toBe(200);
    expect(shopItems.pro_7d.capPerQuarter).toBe(4);
    // Code-owned mechanics untouched.
    expect(shopItems.pro_7d.proDays).toBe(7);
    expect(shopItems.pro_7d.proProductId).toBe('pro_weekly');
  });

  it('ignores cap overrides for missions/items uncapped in code', async () => {
    setRows([
      { key: 'mission.first_trip.cap', value: '2' },
      { key: 'shop.scan_credit_1.capPerQuarter', value: '2' },
    ]);
    const { missions, shopItems } = await service.getEffectiveDefs();
    expect(missions.first_trip.cap).toBeUndefined();
    expect(shopItems.scan_credit_1.capPerQuarter).toBeUndefined();
  });

  it('ignores corrupt/invalid rows and falls back to defaults', async () => {
    setRows([
      { key: 'mission.first_trip.reward', value: 'banana' },
      { key: 'shop.pro_7d.price', value: '-5' },
      { key: 'shop.market_unlock.price', value: '0' }, // price must be >= 1
    ]);
    const { missions, shopItems } = await service.getEffectiveDefs();
    expect(missions.first_trip.reward).toBe(MISSION_DEFS.first_trip.reward);
    expect(shopItems.pro_7d.price).toBe(SHOP_ITEMS.pro_7d.price);
    expect(shopItems.market_unlock.price).toBe(SHOP_ITEMS.market_unlock.price);
  });

  it('caches reads and busts the cache on update', async () => {
    await service.getEffectiveDefs();
    await service.getEffectiveDefs();
    expect(findMany).toHaveBeenCalledTimes(1);

    setRows([{ key: 'mission.first_trip.reward', value: '99' }]);
    await service.update({ missions: [{ id: 'first_trip', reward: 99 }] });
    expect(upsert).toHaveBeenCalledWith({
      where: { key: 'mission.first_trip.reward' },
      create: { key: 'mission.first_trip.reward', value: '99' },
      update: { value: '99' },
    });

    const { missions } = await service.getEffectiveDefs();
    expect(missions.first_trip.reward).toBe(99);
  });

  it('null resets a key (deleteMany) and skips code-uncapped cap fields', async () => {
    await service.update({
      missions: [{ id: 'first_trip', reward: null, cap: null }],
      shopItems: [{ id: 'pro_30d', price: null, capPerQuarter: 3 }],
    });
    expect(deleteMany).toHaveBeenCalledWith({
      where: {
        key: { in: ['mission.first_trip.reward', 'shop.pro_30d.price'] },
      },
    });
    // first_trip has no code cap → its cap key is never touched; pro_30d's
    // capPerQuarter is capped in code → upserted.
    expect(upsert).toHaveBeenCalledWith({
      where: { key: 'shop.pro_30d.capPerQuarter' },
      create: { key: 'shop.pro_30d.capPerQuarter', value: '3' },
      update: { value: '3' },
    });
  });

  it('getAdminView reports effective values, defaults, and override flags', async () => {
    setRows([{ key: 'shop.pro_7d.price', value: '200' }]);
    const view = await service.getAdminView();
    const pro7d = view.shopItems.find((s) => s.id === 'pro_7d')!;
    expect(pro7d.price).toBe(200);
    expect(pro7d.defaultPrice).toBe(SHOP_ITEMS.pro_7d.price);
    expect(pro7d.priceOverridden).toBe(true);
    expect(pro7d.capPerQuarterOverridden).toBe(false);
    const firstTrip = view.missions.find((m) => m.id === 'first_trip')!;
    expect(firstTrip.rewardOverridden).toBe(false);
    expect(firstTrip.cap).toBeNull();
  });
});
