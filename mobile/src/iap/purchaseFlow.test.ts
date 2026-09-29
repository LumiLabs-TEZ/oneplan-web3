import type { Purchase } from 'expo-iap';

import type { SubscriptionStatusDto } from '@/features/subscription/types';

import {
  ERR_SERVER_VALIDATION,
  ERR_VERIFICATION,
  handlePurchase,
  type PurchaseDeps,
  purchaseKind,
} from './purchaseFlow';

const STATUS: SubscriptionStatusDto = {
  tier: 'pro_monthly',
  status: 'ACTIVE',
} as SubscriptionStatusDto;

const JWS = 'header.payload.signature';

function iosPurchase(productId: string, token: string | null = JWS): Purchase {
  return {
    id: 'txn-1',
    productId,
    purchaseToken: token,
    transactionId: 'txn-1',
    transactionDate: 1_711_627_200_000,
    purchaseState: 'purchased',
    isAutoRenewing: true,
    quantity: 1,
    store: 'apple',
    platform: 'ios',
  } as unknown as Purchase;
}

function androidPurchase(productId: string, token: string | null = 'play-token'): Purchase {
  return {
    id: 'order-1',
    productId,
    purchaseToken: token,
    transactionId: 'GPA.1234',
    transactionDate: 1_711_627_200_000,
    purchaseState: 'purchased',
    isAutoRenewing: true,
    quantity: 1,
    store: 'google',
    platform: 'android',
  } as unknown as Purchase;
}

function deps(over: Partial<PurchaseDeps> = {}): PurchaseDeps & {
  validateApple: jest.Mock;
  verifyPlay: jest.Mock;
  finish: jest.Mock;
} {
  const order: string[] = [];
  const base = {
    order,
    validateApple: jest.fn(async () => {
      order.push('validateApple');
      return STATUS;
    }),
    verifyPlay: jest.fn(async () => {
      order.push('verifyPlay');
      return STATUS;
    }),
    finish: jest.fn(async () => {
      order.push('finish');
    }),
    platform: 'ios' as const,
    packageName: 'com.oneplan.app',
  };
  return { ...base, ...over } as never;
}

describe('purchaseKind', () => {
  it.each([
    ['pro_weekly', 'sub'],
    ['pro_monthly', 'sub'],
    ['pro_yearly', 'sub'],
    ['pay_once', 'pay_once'],
    ['oneplan.video_scan_5', 'scan_pack'],
    ['scan_pack_15', 'scan_pack'],
  ])('%s -> %s', (sku, kind) => {
    expect(purchaseKind(sku)).toBe(kind);
  });

  it('treats an unknown SKU as a subscription (server is authoritative)', () => {
    expect(purchaseKind('mystery')).toBe('sub');
  });
});

describe('handlePurchase — iOS', () => {
  it('validates with the server BEFORE finishing the transaction', async () => {
    const d = deps();
    const res = await handlePurchase(iosPurchase('pro_monthly'), d);
    expect(d.validateApple).toHaveBeenCalledWith(JWS);
    expect((d as unknown as { order: string[] }).order).toEqual(['validateApple', 'finish']);
    expect(res).toEqual({ status: STATUS, kind: 'sub' });
  });

  it('does NOT finish when the server rejects, and rethrows the i18n key', async () => {
    const d = deps({
      validateApple: jest.fn(async () => {
        throw new Error('HTTP 500');
      }),
    });
    await expect(handlePurchase(iosPurchase('pro_monthly'), d)).rejects.toThrow(
      ERR_SERVER_VALIDATION,
    );
    expect(d.finish).not.toHaveBeenCalled();
  });

  it('keeps the server error as `cause` so callers can inspect the status', async () => {
    const original = new Error('HTTP 503');
    const d = deps({
      validateApple: jest.fn(async () => {
        throw original;
      }),
    });
    await expect(handlePurchase(iosPurchase('pro_monthly'), d)).rejects.toMatchObject({
      cause: original,
    });
  });

  it('rejects a malformed JWS BEFORE any network call', async () => {
    const d = deps();
    await expect(handlePurchase(iosPurchase('pro_monthly', 'not-a-jws'), d)).rejects.toThrow(
      ERR_VERIFICATION,
    );
    expect(d.validateApple).not.toHaveBeenCalled();
    expect(d.finish).not.toHaveBeenCalled();
  });

  it('rejects a missing purchase token before any network call', async () => {
    const d = deps();
    await expect(handlePurchase(iosPurchase('pro_monthly', null), d)).rejects.toThrow(
      ERR_VERIFICATION,
    );
    expect(d.validateApple).not.toHaveBeenCalled();
  });

  it('finishes a scan pack as a consumable', async () => {
    const d = deps();
    const res = await handlePurchase(iosPurchase('oneplan.video_scan_5'), d);
    expect(d.finish).toHaveBeenCalledWith(
      expect.objectContaining({ productId: 'oneplan.video_scan_5' }),
      true,
    );
    expect(res.kind).toBe('scan_pack');
  });

  it('finishes a subscription and pay_once as NON-consumable', async () => {
    const d = deps();
    await handlePurchase(iosPurchase('pro_monthly'), d);
    await handlePurchase(iosPurchase('pay_once'), d);
    expect(d.finish).toHaveBeenNthCalledWith(1, expect.anything(), false);
    expect(d.finish).toHaveBeenNthCalledWith(2, expect.anything(), false);
  });
});

describe('handlePurchase — Android', () => {
  it('verifies with the Play body shape, then finishes', async () => {
    const d = deps({ platform: 'android' });
    const res = await handlePurchase(androidPurchase('pro_yearly'), d);
    expect(d.verifyPlay).toHaveBeenCalledWith({
      packageName: 'com.oneplan.app',
      productId: 'pro_yearly',
      purchaseToken: 'play-token',
      orderId: 'GPA.1234',
      purchaseTimeMillis: '1711627200000',
      purchaseState: 0,
    });
    expect((d as unknown as { order: string[] }).order).toEqual(['verifyPlay', 'finish']);
    expect(res.kind).toBe('sub');
    expect(d.validateApple).not.toHaveBeenCalled();
  });

  it('omits orderId when the store did not provide a transaction id', async () => {
    const d = deps({ platform: 'android' });
    const purchase = { ...androidPurchase('pro_yearly'), transactionId: null } as Purchase;
    await handlePurchase(purchase, d);
    expect(d.verifyPlay.mock.calls[0]?.[0]).toMatchObject({ orderId: undefined });
  });

  it('does NOT consume a scan pack when verification fails', async () => {
    const d = deps({
      platform: 'android',
      verifyPlay: jest.fn(async () => {
        throw new Error('HTTP 400');
      }),
    });
    await expect(handlePurchase(androidPurchase('oneplan.video_scan_1'), d)).rejects.toThrow(
      ERR_SERVER_VALIDATION,
    );
    expect(d.finish).not.toHaveBeenCalled();
  });

  it('rejects a missing purchase token before any network call', async () => {
    const d = deps({ platform: 'android' });
    await expect(handlePurchase(androidPurchase('pro_yearly', null), d)).rejects.toThrow(
      ERR_VERIFICATION,
    );
    expect(d.verifyPlay).not.toHaveBeenCalled();
  });
});
