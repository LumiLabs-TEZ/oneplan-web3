// Redeem-sheet math: cost, affordability boundary, and stepper eligibility.
// Ported 1:1 from ios OnePlanTests/RedeemQuantityModelTests.swift.

import { redeemQuantity, type RedeemQuantityInputs } from './redeemQuantity';

function model(overrides: Partial<RedeemQuantityInputs> = {}) {
  return redeemQuantity({
    price: 30,
    quantity: 1,
    balance: 100,
    itemId: 'scan_credit_1',
    ...overrides,
  });
}

describe('RedeemQuantityModel', () => {
  test('total is price × quantity', () => {
    expect(model({ price: 30, quantity: 3 }).total).toBe(90);
    expect(model({ price: 30, quantity: 1 }).total).toBe(30);
  });

  test('Exact balance is affordable', () => {
    const m = model({ price: 30, quantity: 2, balance: 60 });
    expect(m.total).toBe(60);
    expect(m.shortfall).toBe(0);
    expect(m.canAfford).toBe(true);
  });

  test('One spark short is not affordable', () => {
    const m = model({ price: 30, quantity: 2, balance: 59 });
    expect(m.shortfall).toBe(1);
    expect(m.canAfford).toBe(false);
  });

  test('shortfall clamps at 0 when the balance exceeds the total', () => {
    const m = model({ price: 30, quantity: 1, balance: 500 });
    expect(m.shortfall).toBe(0);
    expect(m.canAfford).toBe(true);
  });

  test('shortfall grows with quantity', () => {
    expect(model({ price: 50, quantity: 4, balance: 100 }).shortfall).toBe(100);
  });

  test.each([
    ['scan_credit_1', true],
    ['market_unlock', false],
    ['pro_7d', false],
    ['pro_30d', false],
  ] as const)('Only scan_credit_1 is steppable (%s → %s)', (itemId, expected) => {
    expect(model({ itemId }).steppable).toBe(expected);
  });
});
