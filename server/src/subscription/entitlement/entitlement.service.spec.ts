import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanCreditService } from '../../scan-credit/scan-credit.service';
import { EntitlementService } from './entitlement.service';
import { StoreEvent } from '../store-event/store-event.types';

// The tx mock must be ONE stable object, not recreated on every call —
// otherwise nothing can be asserted on it after $transaction finishes.
type TxMock = {
  user: { update: jest.Mock };
  subscriptionTransaction: { upsert: jest.Mock };
  $executeRaw: jest.Mock;
};

const makeTxMock = (): TxMock => ({
  user: { update: jest.fn().mockResolvedValue({}) },
  subscriptionTransaction: { upsert: jest.fn().mockResolvedValue({}) },
  $executeRaw: jest.fn().mockResolvedValue(1),
});

const makePrismaMock = (tx: TxMock) =>
  ({
    $transaction: jest.fn(async (cb: any) =>
      typeof cb === 'function' ? cb(tx) : undefined,
    ),
  }) as unknown as PrismaService;

const makeScanCreditMock = () =>
  ({
    reconcileProGrants: jest.fn().mockResolvedValue(undefined),
    grantPurchase: jest.fn().mockResolvedValue(undefined),
    revokePurchase: jest.fn().mockResolvedValue(null),
    restorePurchase: jest.fn().mockResolvedValue(null),
  }) as unknown as ScanCreditService;

const subEvent = (over: Partial<StoreEvent> = {}): StoreEvent => ({
  store: 'APPLE',
  source: 'CLIENT_VERIFY',
  kind: 'SUBSCRIPTION_STATE',
  lineId: 'orig-1',
  transactionId: 'txn-1',
  productId: 'pro_monthly',
  userId: 7,
  status: SubscriptionStatus.ACTIVE,
  expiresAt: new Date('2027-01-01T00:00:00.000Z'),
  environment: 'Production',
  ...over,
});

describe('EntitlementService', () => {
  let tx: TxMock;
  let prisma: PrismaService;
  let scanCredit: ScanCreditService;
  let service: EntitlementService;

  beforeEach(() => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx);
    scanCredit = makeScanCreditMock();
    service = new EntitlementService(prisma, scanCredit);
  });

  describe('SUBSCRIPTION_STATE', () => {
    it('grants Pro credit eagerly for BOTH stores — no separate branch for Google', async () => {
      await service.apply(
        subEvent({ store: 'GOOGLE', lineId: 'play-token-1' }),
      );
      expect(scanCredit.reconcileProGrants).toHaveBeenCalledWith(7);
    });

    it('writes status, expiry date and lineId onto User', async () => {
      await service.apply(subEvent());
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: {
          subscriptionStatus: SubscriptionStatus.ACTIVE,
          subscriptionProductId: 'pro_monthly',
          subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
          originalTransactionId: 'orig-1',
        },
      });
    });

    it('holds a per-user advisory lock before writing', async () => {
      await service.apply(subEvent());
      expect(tx.$executeRaw).toHaveBeenCalled();
    });

    it('upserts the ledger by transactionId (idempotent on replay)', async () => {
      await service.apply(subEvent());
      expect(tx.subscriptionTransaction.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { transactionId: 'txn-1' } }),
      );
    });

    it('skips when userId is missing (user not yet resolved)', async () => {
      await service.apply(subEvent({ userId: undefined }));
      expect(scanCredit.reconcileProGrants).not.toHaveBeenCalled();
      expect(tx.user.update).not.toHaveBeenCalled();
    });

    // Fail-closed on removal: an event that doesn't know the subscription's
    // state must never be able to downgrade a paying user.
    describe('refuses to write an under-specified event', () => {
      it('does NOT downgrade to NONE when status is missing', async () => {
        await service.apply(subEvent({ status: undefined }));
        expect(tx.user.update).not.toHaveBeenCalled();
        expect(tx.subscriptionTransaction.upsert).not.toHaveBeenCalled();
        expect(scanCredit.reconcileProGrants).not.toHaveBeenCalled();
      });

      it('does NOT blank subscriptionProductId when productId is empty', async () => {
        await service.apply(subEvent({ productId: '' }));
        expect(tx.user.update).not.toHaveBeenCalled();
        expect(scanCredit.reconcileProGrants).not.toHaveBeenCalled();
      });

      it('resolves without throwing so one bad event cannot break a batch', async () => {
        await expect(
          service.apply(subEvent({ status: undefined })),
        ).resolves.toBeUndefined();
      });
    });
  });

  describe('ONE_TIME_PURCHASE', () => {
    const packEvent = (over: Partial<StoreEvent> = {}): StoreEvent =>
      subEvent({
        kind: 'ONE_TIME_PURCHASE',
        productId: 'oneplan.video_scan_5',
        status: undefined,
        expiresAt: undefined,
        ...over,
      });

    it('grants credit per SKU and does NOT touch subscription status', async () => {
      await service.apply(packEvent());
      expect(scanCredit.grantPurchase).toHaveBeenCalledWith(
        7,
        'oneplan.video_scan_5',
        'txn-1',
        'Production',
      );
      expect(scanCredit.reconcileProGrants).not.toHaveBeenCalled();
    });

    it('passes the correct Test environment down to grantPurchase', async () => {
      await service.apply(packEvent({ environment: 'Test' }));
      expect(scanCredit.grantPurchase).toHaveBeenCalledWith(
        7,
        'oneplan.video_scan_5',
        'txn-1',
        'Test',
      );
    });
  });

  describe('REFUND', () => {
    const refundEvent = (over: Partial<StoreEvent> = {}): StoreEvent =>
      subEvent({
        kind: 'REFUND',
        productId: 'oneplan.video_scan_5',
        status: undefined,
        revokedAt: new Date('2026-07-24T00:00:00.000Z'),
        ...over,
      });

    it('revokes the unused credit via revokePurchase', async () => {
      await service.apply(refundEvent());
      expect(scanCredit.revokePurchase).toHaveBeenCalledWith('orig-1', 'txn-1');
    });

    it('does NOT throw when no grant is found (fail-open on revoke)', async () => {
      (scanCredit.revokePurchase as jest.Mock).mockResolvedValue(null);
      await expect(service.apply(refundEvent())).resolves.toBeUndefined();
    });

    it('works for GOOGLE too, no separate branch per store', async () => {
      await service.apply(refundEvent({ store: 'GOOGLE', lineId: 'play-tok' }));
      expect(scanCredit.revokePurchase).toHaveBeenCalledWith(
        'play-tok',
        'txn-1',
      );
    });
  });
});
