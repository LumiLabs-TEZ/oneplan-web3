import { SubscriptionStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ScanCreditService } from '../../scan-credit/scan-credit.service';
import { EntitlementService } from '../entitlement/entitlement.service';
import { StoreEventProcessor } from './store-event.processor';
import { StoreEvent } from './store-event.types';

/**
 * Regression for the orphan-replay entitlement wipe.
 *
 * Reproduces the exact production sequence in
 * subscription.service.ts (verifyPlayPurchase): storeEventProcessor.process()
 * writes the freshly verified state, then storeEventProcessor.replayOrphans()
 * runs immediately after. replayOrphans() used to rebuild a hollow
 * SUBSCRIPTION_STATE event (`productId: ''`, no status, no expiry) from the
 * stored notification, which drove EntitlementService.applySubscriptionState()
 * onto `event.status ?? NONE` and downgraded a paying subscriber to
 * NONE / '' / null.
 *
 * Unlike store-event.processor.spec.ts this wires the REAL EntitlementService
 * behind the processor — a mocked entitlement layer cannot show whether the
 * user row survived, which is the only thing that actually matters here.
 */

type TxMock = {
  user: { update: jest.Mock };
  subscriptionTransaction: { upsert: jest.Mock };
  $executeRaw: jest.Mock;
};

const LINE_ID = 'play-token-abc';

const makeTxMock = (): TxMock => ({
  user: { update: jest.fn().mockResolvedValue({}) },
  subscriptionTransaction: { upsert: jest.fn().mockResolvedValue({}) },
  $executeRaw: jest.fn().mockResolvedValue(1),
});

const makePrismaMock = (tx: TxMock, orphanRows: unknown[]) =>
  ({
    $transaction: jest.fn(async (cb: any) =>
      typeof cb === 'function' ? cb(tx) : undefined,
    ),
    storeNotification: {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({ id: 1 }),
      update: jest.fn().mockResolvedValue({}),
      findMany: jest.fn().mockResolvedValue(orphanRows),
    },
    subscriptionTransaction: {
      findFirst: jest.fn().mockResolvedValue({ userId: 7 }),
    },
  }) as unknown as PrismaService;

const makeScanCreditMock = () =>
  ({
    reconcileProGrants: jest.fn().mockResolvedValue(undefined),
    grantPurchase: jest.fn().mockResolvedValue(undefined),
    revokePurchase: jest.fn().mockResolvedValue(null),
    restorePurchase: jest.fn().mockResolvedValue(null),
  }) as unknown as ScanCreditService;

/** What the client verify just proved: an ACTIVE, paid-up subscription. */
const clientVerifyEvent = (): StoreEvent => ({
  store: 'GOOGLE',
  source: 'CLIENT_VERIFY',
  kind: 'SUBSCRIPTION_STATE',
  lineId: LINE_ID,
  transactionId: 'GPA.1234-5678-9012-34567..0',
  productId: 'pro_monthly',
  userId: 7,
  status: SubscriptionStatus.ACTIVE,
  expiresAt: new Date('2027-01-01T00:00:00.000Z'),
  environment: 'Production',
});

/** An RTDN that arrived before the client verify, so it never found a user. */
const orphanSubscriptionRow = () => ({
  id: 99,
  notificationUUID: 'uuid-orphan-rtdn',
  notificationType: null,
  originalTransactionId: LINE_ID,
  transactionId: LINE_ID,
  environment: 'Production',
  store: 'GOOGLE',
  userId: null,
  rawPayload: {
    subscriptionNotification: { notificationType: 2, purchaseToken: LINE_ID },
  },
});

describe('orphan replay must not wipe entitlement', () => {
  let tx: TxMock;
  let prisma: PrismaService;
  let processor: StoreEventProcessor;

  beforeEach(() => {
    tx = makeTxMock();
    prisma = makePrismaMock(tx, [orphanSubscriptionRow()]);
    const entitlement = new EntitlementService(prisma, makeScanCreditMock());
    processor = new StoreEventProcessor(prisma, entitlement);
  });

  it('keeps the verified ACTIVE state after replayOrphans runs', async () => {
    await processor.process(clientVerifyEvent());

    // Precondition: the verify really did write the good state.
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 7 },
      data: {
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        subscriptionProductId: 'pro_monthly',
        subscriptionExpiresAt: new Date('2027-01-01T00:00:00.000Z'),
        originalTransactionId: LINE_ID,
      },
    });

    await processor.replayOrphans(LINE_ID, 7);

    // The replay must not have touched the user row at all.
    expect(tx.user.update).toHaveBeenCalledTimes(1);
  });

  it('never writes NONE, an empty productId, or a null expiry', async () => {
    await processor.process(clientVerifyEvent());
    await processor.replayOrphans(LINE_ID, 7);

    for (const [call] of tx.user.update.mock.calls) {
      expect(call.data.subscriptionStatus).not.toBe(SubscriptionStatus.NONE);
      expect(call.data.subscriptionProductId).not.toBe('');
      expect(call.data.subscriptionExpiresAt).not.toBeNull();
    }
  });

  it('still applies an orphaned refund — the replay is not disabled', async () => {
    prisma = makePrismaMock(tx, [
      {
        ...orphanSubscriptionRow(),
        id: 100,
        notificationUUID: 'uuid-orphan-void',
        rawPayload: {
          voidedPurchaseNotification: {
            purchaseToken: LINE_ID,
            orderId: 'GPA.1',
          },
        },
      },
    ]);
    const scanCredit = makeScanCreditMock();
    processor = new StoreEventProcessor(
      prisma,
      new EntitlementService(prisma, scanCredit),
    );

    const replayed = await processor.replayOrphans(LINE_ID, 7);

    expect(replayed).toBe(1);
    expect(scanCredit.revokePurchase).toHaveBeenCalledWith(LINE_ID, LINE_ID);
    // A refund must not rewrite subscription state either.
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
