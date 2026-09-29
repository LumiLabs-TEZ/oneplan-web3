import { RedemptionError, RedemptionRunner } from './redemption';
import type { Overview, RedeemInput, Redemption } from '../api/queries';
const overview: Overview = {
  balance: 120,
  totalEarned: 120,
  missions: [],
  shopItems: [
    {
      itemId: 'scan_credit_1',
      price: 30,
      available: true,
      rewardType: 'scan_credit',
      redeemedCount: 0,
    },
  ],
};
function setup() {
  return {
    online: jest.fn(() => true),
    overview: jest.fn(async () => overview),
    redeem: jest.fn(async (_body: RedeemInput): Promise<Redemption> => ({
      itemId: 'scan_credit_1',
      price: 30,
      newBalance: 90,
    })),
  };
}
it('redeems sequentially and stops on the first failure, counting only confirmed writes', async () => {
  const deps = setup();
  const order: number[] = [];
  let calls = 0;
  deps.redeem.mockImplementation(async () => {
    calls++;
    order.push(calls);
    if (calls === 2) throw new TypeError('lost response');
    await Promise.resolve();
    return { itemId: 'scan_credit_1', price: 30, newBalance: 90 };
  });
  const result = await new RedemptionRunner().run('scan_credit_1', 4, deps);
  expect(result.confirmed).toHaveLength(1);
  expect(result.error).toBeInstanceOf(TypeError);
  expect(order).toEqual([1, 2]);
});
it('does not send writes offline, for exhausted rewards, or when unaffordable', async () => {
  const runner = new RedemptionRunner();
  const deps = setup();
  deps.online.mockReturnValue(false);
  await runner.run('scan_credit_1', 1, deps);
  expect(deps.overview).not.toHaveBeenCalled();
  deps.online.mockReturnValue(true);
  await runner.run('scan_credit_1', 5, deps);
  deps.overview.mockResolvedValue({
    ...overview,
    shopItems: [{ ...overview.shopItems[0]!, available: false }],
  });
  await runner.run('scan_credit_1', 1, deps);
  expect(deps.redeem).not.toHaveBeenCalled();
});
it('rejects duplicate submission while waiting for the balance and only allows scan stepping', async () => {
  const runner = new RedemptionRunner();
  const deps = setup();
  let resolve!: (value: Overview) => void;
  deps.overview.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const first = runner.run('scan_credit_1', 1, deps);
  await expect(runner.run('scan_credit_1', 1, deps)).rejects.toMatchObject(
    new RedemptionError('busy'),
  );
  resolve(overview);
  await first;
  const result = await runner.run('pro_7d', 2, deps);
  expect(result.error).toEqual(new RedemptionError('invalid_quantity'));
  expect(deps.redeem).toHaveBeenCalledTimes(1);
});
it('requires successful balance refresh before another attempt after an ambiguous failure', async () => {
  const runner = new RedemptionRunner();
  const deps = setup();
  deps.redeem.mockRejectedValueOnce(new TypeError('network'));
  await runner.run('scan_credit_1', 1, deps);
  deps.overview.mockRejectedValueOnce(new TypeError('still offline'));
  await runner.run('scan_credit_1', 1, deps);
  expect(deps.redeem).toHaveBeenCalledTimes(1);
  await runner.run('scan_credit_1', 1, deps);
  expect(deps.overview).toHaveBeenCalledTimes(3);
  expect(deps.redeem).toHaveBeenCalledTimes(2);
});
it('checks connectivity between credits', async () => {
  const deps = setup();
  deps.online.mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
  const result = await new RedemptionRunner().run('scan_credit_1', 3, deps);
  expect(result.confirmed).toHaveLength(1);
  expect(deps.redeem).toHaveBeenCalledTimes(1);
});
