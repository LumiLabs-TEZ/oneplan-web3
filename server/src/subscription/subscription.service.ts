import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscriptionStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  AppStoreServerAPIClient,
  Environment,
  SignedDataVerifier,
  JWSTransactionDecodedPayload,
  JWSRenewalInfoDecodedPayload,
  NotificationTypeV2,
  ResponseBodyV2DecodedPayload,
  Status,
} from '@apple/app-store-server-library';
import { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ANALYTICS_EVENTS } from '../analytics/constants/events';
import {
  SubscriptionStatusDto,
  SubscriptionTier,
} from './dto/subscription-status.dto';
import { PlayWebhookPayloadDto } from './dto/play-webhook-payload.dto';
import { VerifyPlayPurchaseDto } from './dto/verify-play-purchase.dto';
import {
  GooglePlaySubscriptionVerifierService,
  PlayPurchaseKind,
} from './google-play-subscription-verifier.service';
import {
  RefundResult,
  ScanCreditService,
} from '../scan-credit/scan-credit.service';
import { AppAccountTokenDto } from './dto/app-account-token.dto';
import { AppleStoreAdapter } from './adapters/apple-store.adapter';
import {
  PlayStoreAdapter,
  resolvePlayNotificationType,
} from './adapters/play-store.adapter';
import { StoreEventProcessor } from './store-event/store-event.processor';
import { StoreKind } from './store-event/store-event.types';
import {
  effectiveSubscriptionStatus,
  isEntitledToPro,
} from '../common/subscription-status.util';

// Auto-renewing Pro subscription SKUs. Mirrors iOS StoreManager.
const SUBSCRIPTION_SKUS = new Set<string>([
  'pro_weekly',
  'pro_monthly',
  'pro_yearly',
]);
const PAY_ONCE_SKU = 'pay_once';
type AppStoreVerificationEnvironment =
  | 'Auto'
  | Environment.SANDBOX
  | Environment.PRODUCTION
  | Environment.XCODE
  | Environment.LOCAL_TESTING;

@Injectable()
export class SubscriptionService implements OnModuleInit {
  private readonly logger = new Logger(SubscriptionService.name);
  private readonly verifiers = new Map<Environment, SignedDataVerifier>();
  private readonly apiClients = new Map<Environment, AppStoreServerAPIClient>();
  private verificationEnvironment: AppStoreVerificationEnvironment = 'Auto';

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly analytics: AnalyticsService,
    private readonly playVerifier: GooglePlaySubscriptionVerifierService,
    private readonly scanCredit: ScanCreditService,
    private readonly appleAdapter: AppleStoreAdapter,
    private readonly storeEventProcessor: StoreEventProcessor,
    private readonly playAdapter: PlayStoreAdapter,
  ) {}

  onModuleInit() {
    this.initializeVerifier();
  }

  private initializeVerifier() {
    try {
      const bundleId = this.configService.get<string>('APP_STORE_BUNDLE_ID');
      const appAppleId = this.configService.get<string>(
        'APP_STORE_APP_APPLE_ID',
      );
      const issuerId = this.configService.get<string>('APP_STORE_ISSUER_ID');
      const keyId = this.configService.get<string>('APP_STORE_KEY_ID');
      const encodedPrivateKey = this.configService.get<string>(
        'APP_STORE_PRIVATE_KEY',
      );
      const envString = this.configService.get<string>(
        'APP_STORE_ENVIRONMENT',
        'Auto',
      ) as AppStoreVerificationEnvironment;

      if (!bundleId) {
        this.logger.warn(
          'APP_STORE_BUNDLE_ID not configured, subscription validation disabled',
        );
        return;
      }
      this.verificationEnvironment = envString;
      this.verifiers.clear();
      this.apiClients.clear();

      // Load Apple root certificates
      // Use process.cwd() since certs are at server/certs/, not in dist/
      const certsDir = path.join(process.cwd(), 'certs');
      const rootCAs: Buffer[] = [];

      const certFiles = [
        'AppleRootCA-G2.cer',
        'AppleRootCA-G3.cer',
        'AppleComputerRootCertificate.cer',
      ];

      for (const certFile of certFiles) {
        const certPath = path.join(certsDir, certFile);
        if (fs.existsSync(certPath)) {
          rootCAs.push(fs.readFileSync(certPath));
        } else {
          this.logger.warn(`Certificate file not found: ${certPath}`);
        }
      }

      const canVerifyAppStoreSignatures = rootCAs.length > 0;
      if (!canVerifyAppStoreSignatures) {
        this.logger.warn(
          'No Apple root certificates found, App Store signature verification is disabled for Sandbox/Production',
        );
      }

      const registerVerifier = (environment: Environment): void => {
        if (
          (environment === Environment.SANDBOX ||
            environment === Environment.PRODUCTION) &&
          !canVerifyAppStoreSignatures
        ) {
          return;
        }

        if (
          environment === Environment.PRODUCTION &&
          (!appAppleId || Number.isNaN(Number(appAppleId)))
        ) {
          this.logger.warn(
            'APP_STORE_APP_APPLE_ID is required to verify Production transactions',
          );
          return;
        }

        this.verifiers.set(
          environment,
          new SignedDataVerifier(
            rootCAs,
            true,
            environment,
            bundleId,
            environment === Environment.PRODUCTION
              ? Number(appAppleId)
              : undefined,
          ),
        );
      };

      const signingKey = encodedPrivateKey
        ? encodedPrivateKey.includes('BEGIN PRIVATE KEY')
          ? encodedPrivateKey.replace(/\\n/g, '\n')
          : Buffer.from(encodedPrivateKey, 'base64').toString('utf8')
        : null;
      const registerApiClient = (environment: Environment): void => {
        if (
          environment !== Environment.SANDBOX &&
          environment !== Environment.PRODUCTION
        ) {
          return;
        }
        if (!issuerId || !keyId || !signingKey) {
          this.logger.warn(
            'App Store Server API credentials are missing; canonical subscription synchronization is disabled',
          );
          return;
        }
        this.apiClients.set(
          environment,
          new AppStoreServerAPIClient(
            signingKey,
            keyId,
            issuerId,
            bundleId,
            environment,
          ),
        );
      };

      if (envString === 'Auto') {
        registerVerifier(Environment.SANDBOX);
        registerVerifier(Environment.PRODUCTION);
        registerApiClient(Environment.SANDBOX);
        registerApiClient(Environment.PRODUCTION);
      } else {
        registerVerifier(envString as Environment);
        registerApiClient(envString as Environment);
      }

      if (this.verifiers.size === 0) {
        this.logger.warn(
          'No App Store verifiers were initialized for the current configuration',
        );
        return;
      }

      this.logger.log(
        `SignedDataVerifier initialized for ${Array.from(this.verifiers.keys()).join(', ')}`,
      );
    } catch (error) {
      this.logger.error('Failed to initialize SignedDataVerifier', error);
    }
  }

  /**
   * Validates a JWS transaction from the iOS app and updates the user's subscription.
   */
  async validateTransaction(
    userId: number,
    jws: string,
  ): Promise<SubscriptionStatusDto> {
    if (this.verifiers.size === 0) {
      throw new BadRequestException(
        'Subscription validation is not configured',
      );
    }

    const verifier = this.resolveTransactionVerifier(jws);
    if (!verifier) {
      throw new BadRequestException('Unsupported transaction environment');
    }

    let transaction: JWSTransactionDecodedPayload;
    try {
      transaction = await verifier.verifyAndDecodeTransaction(jws);
    } catch (error) {
      this.logger.warn(
        `Transaction verification failed for user ${userId}`,
        error,
      );
      throw new BadRequestException('Invalid transaction signature');
    }

    const productId = transaction.productId ?? '';

    if (this.scanCredit.isCreditProduct(productId)) {
      // Consumable scan-credit pack or pay_once. These have no expiresDate, so
      // running them through updateUserSubscription() would derive ACTIVE and
      // overwrite the user's real subscription state. Only grant credits —
      // EntitlementService.upsertLedger (via storeEventProcessor.process
      // below) writes the ledger row now.
      await this.storeEventProcessor.process(
        this.appleAdapter.toStoreEvent({
          transaction,
          source: 'CLIENT_VERIFY',
          isCreditProduct: true,
          userId,
        }),
      );
      await this.storeEventProcessor.replayOrphans(
        transaction.originalTransactionId ?? transaction.transactionId ?? '',
        userId,
      );
      return this.getSubscriptionStatus(userId);
    }

    const isAutoRenewable = this.scanCredit.isAutoRenewableSku(productId);

    await this.assertSubscriptionBelongsToCaller(userId, transaction);
    if (isAutoRenewable) {
      await this.assertAppAccountTokenBelongsToCaller(userId, transaction);
    }
    await this.logTransaction(userId, transaction, null, null);

    if (isAutoRenewable) {
      const environment = this.normalizeEnvironment(transaction.environment);
      if (this.isAppStoreEnvironment(environment)) {
        await this.applyCanonicalSubscriptionStatus(
          userId,
          transaction.transactionId ?? transaction.originalTransactionId ?? '',
          environment,
          transaction.subscriptionGroupIdentifier,
        );
      } else {
        await this.updateUserSubscription(userId, transaction);
      }
      await this.scanCredit.reconcileProGrants(userId);
    } else {
      await this.updateUserSubscription(userId, transaction);
    }

    return this.getSubscriptionStatus(userId);
  }

  async getAppAccountToken(userId: number): Promise<AppAccountTokenDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { appAccountToken: true },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.appAccountToken) {
      return { appAccountToken: user.appAccountToken };
    }
    const appAccountToken = randomUUID();
    await this.prisma.user.update({
      where: { id: userId },
      data: { appAccountToken },
    });
    return { appAccountToken };
  }

  async syncSubscriptionStatus(userId: number): Promise<SubscriptionStatusDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { originalTransactionId: true },
    });
    if (!user?.originalTransactionId) {
      return this.getSubscriptionStatus(userId);
    }

    const latestTransaction =
      await this.prisma.subscriptionTransaction.findFirst({
        where: {
          userId,
          originalTransactionId: user.originalTransactionId,
          environment: { in: ['Sandbox', 'Production'] },
        },
        orderBy: { purchaseDate: 'desc' },
        select: { environment: true },
      });
    const environment = this.normalizeEnvironment(
      latestTransaction?.environment,
    );
    if (!this.isAppStoreEnvironment(environment)) {
      return this.getSubscriptionStatus(userId);
    }

    await this.applyCanonicalSubscriptionStatus(
      userId,
      user.originalTransactionId,
      environment,
    );
    return this.getSubscriptionStatus(userId);
  }

  private async assertSubscriptionBelongsToCaller(
    userId: number,
    transaction: JWSTransactionDecodedPayload,
  ): Promise<void> {
    const originalTransactionId = transaction.originalTransactionId;
    if (!originalTransactionId) return;

    const owner = await this.prisma.user.findUnique({
      where: { originalTransactionId },
      select: { id: true },
    });

    if (owner && owner.id !== userId) {
      // Local StoreKit (the Xcode .storekit config and unit-test
      // SKTestSession) reuses a deterministic, tiny originalTransactionId
      // (often "0") that is NOT namespaced per app account. On a shared dev
      // DB this collides with the User.originalTransactionId @unique
      // constraint the moment a second OnePlan account "subscribes". A
      // Xcode/LocalTesting-signed JWS can never reach this code in production
      // (the prod verifier only registers Sandbox/Production environments and
      // an Xcode JWS would fail signature/environment verification), so here
      // we reassign the id to the current caller instead of rejecting. This
      // keeps the production account-takeover guard fully intact.
      const isLocalStoreKit =
        transaction.environment === Environment.XCODE ||
        transaction.environment === Environment.LOCAL_TESTING;

      if (!isLocalStoreKit) {
        throw new BadRequestException(
          'Subscription is already linked to another account',
        );
      }

      this.logger.warn(
        `Reassigning local StoreKit originalTransactionId ${originalTransactionId} ` +
          `from user ${owner.id} to user ${userId} ` +
          `(environment=${transaction.environment})`,
      );
      // Free the @unique id from the prior owner so updateUserSubscription()
      // can claim it for the caller without a P2002 violation.
      await this.prisma.user.update({
        where: { id: owner.id },
        data: {
          originalTransactionId: null,
          subscriptionStatus: SubscriptionStatus.NONE,
          subscriptionProductId: null,
          subscriptionExpiresAt: null,
        },
      });
    }
  }

  private async assertAppAccountTokenBelongsToCaller(
    userId: number,
    transaction: JWSTransactionDecodedPayload,
  ): Promise<void> {
    const environment = this.normalizeEnvironment(transaction.environment);
    if (!this.isAppStoreEnvironment(environment)) return;

    const { appAccountToken } = await this.getAppAccountToken(userId);
    if (
      transaction.appAccountToken &&
      transaction.appAccountToken.toLowerCase() !==
        appAccountToken.toLowerCase()
    ) {
      throw new BadRequestException(
        'Transaction app account token does not match the current user',
      );
    }
    if (transaction.originalTransactionId) {
      // Persist ownership after token validation but before Apple API calls so
      // an association/sync outage cannot leave this subscription claimable.
      await this.prisma.user.update({
        where: { id: userId },
        data: { originalTransactionId: transaction.originalTransactionId },
      });
    }
    if (!transaction.appAccountToken && transaction.originalTransactionId) {
      const client = this.getRequiredApiClient(environment);
      try {
        await client.setAppAccountToken(transaction.originalTransactionId, {
          appAccountToken,
        });
      } catch (error) {
        this.logger.error('Failed to associate App Store account token', error);
        throw new ServiceUnavailableException(
          'Unable to associate subscription with account',
        );
      }
    }
  }

  /**
   * Updates the user's subscription based on Apple transaction data.
   * Derives status from transaction properties since JWSTransactionDecodedPayload
   * does not include a status field directly.
   */
  async updateUserSubscription(
    userId: number,
    transaction: JWSTransactionDecodedPayload,
    appleStatus?: Status | number,
  ): Promise<void> {
    const status =
      appleStatus !== undefined
        ? this.mapAppleStatusToSubscriptionStatus(appleStatus)
        : this.deriveStatusFromTransaction(transaction);
    const expiresAt = transaction.expiresDate
      ? new Date(transaction.expiresDate)
      : null;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: status,
        subscriptionProductId: transaction.productId,
        subscriptionExpiresAt: expiresAt,
        originalTransactionId: transaction.originalTransactionId,
      },
    });

    this.logger.log(
      `Updated subscription for user ${userId}: status=${status}, productId=${transaction.productId}`,
    );
  }

  private isAppStoreEnvironment(
    environment: Environment | null,
  ): environment is Environment.SANDBOX | Environment.PRODUCTION {
    return (
      environment === Environment.SANDBOX ||
      environment === Environment.PRODUCTION
    );
  }

  private getRequiredApiClient(
    environment: Environment.SANDBOX | Environment.PRODUCTION,
  ): AppStoreServerAPIClient {
    const client = this.apiClients.get(environment);
    if (!client) {
      throw new ServiceUnavailableException(
        'App Store subscription synchronization is not configured',
      );
    }
    return client;
  }

  private async applyCanonicalSubscriptionStatus(
    userId: number,
    transactionId: string,
    environment: Environment.SANDBOX | Environment.PRODUCTION,
    subscriptionGroupIdentifier?: string,
  ): Promise<SubscriptionStatus> {
    if (!transactionId) {
      throw new BadRequestException('Missing subscription transaction ID');
    }

    const verifier = this.verifiers.get(environment);
    if (!verifier) {
      throw new ServiceUnavailableException(
        'App Store transaction verification is not configured',
      );
    }

    let response;
    try {
      response =
        await this.getRequiredApiClient(environment).getAllSubscriptionStatuses(
          transactionId,
        );
    } catch (error) {
      this.logger.error('Failed to load canonical App Store status', error);
      throw new ServiceUnavailableException(
        'Unable to synchronize subscription status',
      );
    }

    const candidates: Array<{
      status: SubscriptionStatus;
      transaction: JWSTransactionDecodedPayload;
      renewalInfo: JWSRenewalInfoDecodedPayload | null;
    }> = [];
    for (const group of response.data ?? []) {
      if (
        subscriptionGroupIdentifier &&
        group.subscriptionGroupIdentifier !== subscriptionGroupIdentifier
      ) {
        continue;
      }
      for (const item of group.lastTransactions ?? []) {
        if (!item.signedTransactionInfo) continue;
        let currentTransaction: JWSTransactionDecodedPayload;
        let renewalInfo: JWSRenewalInfoDecodedPayload | null = null;
        try {
          currentTransaction = await verifier.verifyAndDecodeTransaction(
            item.signedTransactionInfo,
          );
          if (item.signedRenewalInfo) {
            renewalInfo = await verifier.verifyAndDecodeRenewalInfo(
              item.signedRenewalInfo,
            );
          }
        } catch (error) {
          this.logger.error(
            'Failed to verify canonical App Store status payload',
            error,
          );
          throw new ServiceUnavailableException(
            'Unable to verify subscription status',
          );
        }
        if (!SUBSCRIPTION_SKUS.has(currentTransaction.productId ?? '')) {
          continue;
        }
        candidates.push({
          status:
            item.status === undefined
              ? this.deriveStatusFromTransaction(currentTransaction)
              : this.mapAppleStatusToSubscriptionStatus(item.status),
          transaction: currentTransaction,
          renewalInfo,
        });
      }
    }

    const rank: Record<SubscriptionStatus, number> = {
      [SubscriptionStatus.ACTIVE]: 5,
      [SubscriptionStatus.GRACE_PERIOD]: 4,
      [SubscriptionStatus.BILLING_RETRY]: 3,
      [SubscriptionStatus.REVOKED]: 2,
      [SubscriptionStatus.EXPIRED]: 1,
      [SubscriptionStatus.NONE]: 0,
    };
    const selected = candidates.sort((left, right) => {
      const statusDifference = rank[right.status] - rank[left.status];
      if (statusDifference !== 0) return statusDifference;
      return (
        (right.transaction.expiresDate ?? right.transaction.purchaseDate ?? 0) -
        (left.transaction.expiresDate ?? left.transaction.purchaseDate ?? 0)
      );
    })[0];
    if (!selected) {
      throw new BadRequestException('No supported Pro subscription found');
    }

    const gracePeriodExpiresAt =
      selected.status === SubscriptionStatus.GRACE_PERIOD &&
      selected.renewalInfo?.gracePeriodExpiresDate
        ? new Date(selected.renewalInfo.gracePeriodExpiresDate)
        : null;
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        subscriptionStatus: selected.status,
        subscriptionProductId: selected.transaction.productId,
        subscriptionExpiresAt: selected.transaction.expiresDate
          ? new Date(selected.transaction.expiresDate)
          : null,
        originalTransactionId: selected.transaction.originalTransactionId,
        autoRenewEnabled: selected.renewalInfo?.autoRenewStatus === 1,
        gracePeriodExpiresAt,
      },
    });

    this.logger.log(
      `Synchronized subscription for user ${userId}: status=${selected.status}, productId=${selected.transaction.productId}, environment=${environment}`,
    );

    return selected.status;
  }

  /**
   * Derives subscription status from transaction properties.
   * Used when validating a transaction directly from the iOS app
   * where we don't have the status field from the notification Data object.
   */
  private deriveStatusFromTransaction(
    transaction: JWSTransactionDecodedPayload,
  ): SubscriptionStatus {
    // If revoked, it's revoked
    if (transaction.revocationDate) {
      return SubscriptionStatus.REVOKED;
    }

    // If no expiration date (like a non-auto-renewable purchase), treat as active
    if (!transaction.expiresDate) {
      return SubscriptionStatus.ACTIVE;
    }

    // Check if expired
    const now = Date.now();
    if (transaction.expiresDate < now) {
      return SubscriptionStatus.EXPIRED;
    }

    // Not expired and not revoked = active
    return SubscriptionStatus.ACTIVE;
  }

  /**
   * Handles App Store Server Notification V2 webhooks.
   */
  async handleWebhook(signedPayload: string): Promise<void> {
    if (this.verifiers.size === 0) {
      throw new BadRequestException(
        'Subscription validation is not configured',
      );
    }

    const verifier = this.resolveNotificationVerifier(signedPayload);
    if (!verifier) {
      throw new BadRequestException('Unsupported notification environment');
    }

    let notification: ResponseBodyV2DecodedPayload;
    try {
      notification = await verifier.verifyAndDecodeNotification(signedPayload);
    } catch (error) {
      this.logger.warn('Webhook notification verification failed', error);
      throw new BadRequestException('Invalid notification signature');
    }

    const notificationType = notification.notificationType;
    const notificationUUID = notification.notificationUUID;
    const signedDate = notification.signedDate;

    const isTestNotification = notificationType === NotificationTypeV2.TEST;
    if (!isTestNotification && !signedDate) {
      throw new BadRequestException('Missing signedDate in notification');
    }
    if (!(await this.claimNotification(notification))) {
      return;
    }

    // Extract transaction data
    const transactionInfo = notification.data?.signedTransactionInfo;
    if (!transactionInfo) {
      // Some notifications (like TEST) may not have transaction info
      if (isTestNotification) {
        this.logger.log('Received TEST notification from Apple');
        await this.completeNotification(notificationUUID);
        return;
      }
      this.logger.warn(
        `Notification ${notificationType} has no transaction info`,
      );
      await this.completeNotification(notificationUUID);
      return;
    }

    let transaction: JWSTransactionDecodedPayload;
    try {
      transaction = await verifier.verifyAndDecodeTransaction(transactionInfo);
    } catch (error) {
      this.logger.warn('Transaction verification in webhook failed', error);
      await this.failNotification(
        notificationUUID,
        'Invalid transaction in notification',
      );
      throw new BadRequestException('Invalid transaction in notification');
    }

    // Credit products (consumable scan packs / pay_once) are handled BEFORE
    // the subscription user lookup: a consumable's originalTransactionId never
    // matches User.originalTransactionId, so the !user branch below would
    // otherwise silently drop refund notifications. These never touch
    // subscription state.
    const creditProductId = transaction.productId ?? '';
    if (this.scanCredit.isCreditProduct(creditProductId)) {
      const oTxn = transaction.originalTransactionId ?? '';
      const txn = transaction.transactionId ?? '';
      const revocationReason =
        (transaction as { revocationReason?: number }).revocationReason ?? null;
      let result: RefundResult | null = null;
      if (
        notificationType === NotificationTypeV2.REFUND ||
        notificationType === NotificationTypeV2.REVOKE
      ) {
        result = await this.scanCredit.revokePurchase(oTxn, txn);
      } else if (notificationType === NotificationTypeV2.REFUND_REVERSED) {
        result = await this.scanCredit.restorePurchase(oTxn, txn);
      }

      if (result?.userId) {
        await this.logTransaction(
          result.userId,
          transaction,
          notificationType ?? null,
          null,
          signedDate ? new Date(signedDate) : null,
        );
        // Record the refund into the analytics tracker. Fire-and-forget (same
        // as SUBSCRIPTION_STARTED). Skip when !applied so an idempotent replay
        // doesn't double-count.
        if (result.applied) {
          const isRestore =
            notificationType === NotificationTypeV2.REFUND_REVERSED;
          const amount = result.grantedAmount || 1;
          void this.analytics.track(ANALYTICS_EVENTS.SCAN_PACK_REFUNDED, {
            userId: result.userId,
            properties: {
              outcome: isRestore ? 'restored' : 'revoked',
              productId: result.productId,
              transactionId: txn,
              originalTransactionId: oTxn,
              notificationType: notificationType ?? null,
              grantedAmount: result.grantedAmount,
              clawedBack: result.clawedBack,
              consumedAtRefund: result.consumedAtRefund,
              restored: result.restored,
              reclaimedPct: Math.round((result.clawedBack / amount) * 100),
              consumedPct: Math.round((result.consumedAtRefund / amount) * 100),
              revocationReason,
            },
          });
        }
      } else if (notificationType === NotificationTypeV2.REFUND_DECLINED) {
        // Apple denied the refund — still record who/what (no ledger change).
        const peek = await this.scanCredit.peekPurchaseGrant(oTxn, txn);
        if (peek) {
          void this.analytics.track(ANALYTICS_EVENTS.SCAN_PACK_REFUNDED, {
            userId: peek.userId,
            properties: {
              outcome: 'declined',
              productId: peek.productId,
              transactionId: txn,
              originalTransactionId: oTxn,
              notificationType: notificationType ?? null,
              grantedAmount: peek.grantedAmount,
              clawedBack: 0,
              consumedAtRefund: peek.grantedAmount - peek.remaining,
              restored: 0,
              reclaimedPct: 0,
              consumedPct: Math.round(
                ((peek.grantedAmount - peek.remaining) /
                  (peek.grantedAmount || 1)) *
                  100,
              ),
              revocationReason,
            },
          });
        } else {
          this.logTransactionWithoutUser(transaction);
        }
      } else {
        this.logTransactionWithoutUser(transaction);
      }
      await this.completeNotification(
        notificationUUID,
        transaction,
        result?.userId,
      );
      return;
    }

    // Find user by originalTransactionId
    const user = await this.prisma.user.findUnique({
      where: { originalTransactionId: transaction.originalTransactionId },
    });

    if (!user) {
      this.logger.warn(
        `No user found for originalTransactionId ${transaction.originalTransactionId}`,
      );
      // Still log the transaction without a user
      this.logTransactionWithoutUser(transaction);
      await this.completeNotification(notificationUUID, transaction);
      return;
    }

    // Credit products were already fully handled (and returned) before the
    // user lookup above — anything reaching here is an auto-renewable sub.
    // EntitlementService.upsertLedger (via storeEventProcessor.process below)
    // writes the ledger row now — logTransaction here would be a duplicate.
    const productId = transaction.productId ?? '';

    if (this.scanCredit.isAutoRenewableSku(productId)) {
      const environment = this.normalizeEnvironment(transaction.environment);
      if (!this.isAppStoreEnvironment(environment)) {
        throw new BadRequestException('Unsupported webhook environment');
      }
      let mappedStatus: SubscriptionStatus;
      try {
        mappedStatus = await this.applyCanonicalSubscriptionStatus(
          user.id,
          transaction.transactionId ?? transaction.originalTransactionId ?? '',
          environment,
          transaction.subscriptionGroupIdentifier,
        );
      } catch (error) {
        await this.failNotification(
          notificationUUID,
          'Canonical subscription synchronization failed',
        );
        throw error;
      }
      if (notificationType === NotificationTypeV2.SUBSCRIBED) {
        void this.analytics.track(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED, {
          userId: user.id,
          properties: {
            productId: transaction.productId,
            transactionId: transaction.transactionId,
            originalTransactionId: transaction.originalTransactionId,
          },
        });
      }
      await this.storeEventProcessor.process(
        this.appleAdapter.toStoreEvent({
          transaction,
          source: 'NOTIFICATION',
          notificationUUID,
          notificationType: notificationType ?? undefined,
          signedDate: signedDate ? new Date(signedDate) : undefined,
          status: mappedStatus,
          isCreditProduct: this.scanCredit.isCreditProduct(
            transaction.productId ?? '',
          ),
          raw: notification,
          userId: user.id,
        }),
      );
    }
    await this.completeNotification(notificationUUID, transaction, user.id);
  }

  private async claimNotification(
    notification: ResponseBodyV2DecodedPayload,
  ): Promise<boolean> {
    const notificationUUID = notification.notificationUUID;
    if (!notificationUUID) return true;

    const existing = await this.prisma.storeNotification.findUnique({
      where: { notificationUUID },
      select: { outcome: true },
    });
    if (existing?.outcome === 'PROCESSED') {
      this.logger.log(`Ignoring duplicate notification ${notificationUUID}`);
      return false;
    }
    if (existing) return true;

    try {
      await this.prisma.storeNotification.create({
        data: {
          notificationUUID,
          notificationType: notification.notificationType ?? null,
          environment:
            this.normalizeEnvironment(notification.data?.environment) ?? null,
          signedDate: notification.signedDate
            ? new Date(notification.signedDate)
            : null,
        },
      });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
      const raced = await this.prisma.storeNotification.findUnique({
        where: { notificationUUID },
        select: { outcome: true },
      });
      return raced?.outcome !== 'PROCESSED';
    }
    return true;
  }

  /**
   * Terminal-success writer for notification branches that never reach
   * StoreEventProcessor (credit-product refunds, RTDNs with no actionable
   * purchase info). `store` defaults to 'APPLE' only to preserve existing
   * Apple call sites, which already own their row via claimNotification()
   * — every Play call site must pass 'GOOGLE' explicitly so the row is
   * never left on the schema default for a Play event.
   */
  private async completeNotification(
    notificationUUID: string | undefined,
    transaction?: JWSTransactionDecodedPayload,
    userId?: number,
    store: StoreKind = 'APPLE',
    raw?: unknown,
  ): Promise<void> {
    if (!notificationUUID) return;
    const transactionId = transaction?.transactionId ?? null;
    const originalTransactionId = transaction?.originalTransactionId ?? null;
    const environment = transaction
      ? transaction.environment === 'Production'
        ? 'Production'
        : 'Sandbox'
      : undefined;
    await this.prisma.storeNotification.upsert({
      where: { notificationUUID },
      create: {
        notificationUUID,
        store,
        rawPayload: (raw ?? null) as never,
        outcome: 'PROCESSED',
        processedAt: new Date(),
        userId,
        transactionId,
        originalTransactionId,
        environment: environment ?? null,
      },
      update: {
        outcome: 'PROCESSED',
        processedAt: new Date(),
        errorMessage: null,
        userId,
        transactionId,
        originalTransactionId,
        environment,
        ...(raw !== undefined ? { rawPayload: raw as never } : {}),
      },
    });
  }

  private async failNotification(
    notificationUUID: string | undefined,
    message: string,
    store: StoreKind = 'APPLE',
    raw?: unknown,
  ): Promise<void> {
    if (!notificationUUID) return;
    await this.prisma.storeNotification.upsert({
      where: { notificationUUID },
      create: {
        notificationUUID,
        store,
        rawPayload: (raw ?? null) as never,
        outcome: 'FAILED',
        errorMessage: message.slice(0, 255),
      },
      update: { outcome: 'FAILED', errorMessage: message.slice(0, 255) },
    });
  }

  private resolveTransactionVerifier(
    signedTransactionInfo: string,
  ): SignedDataVerifier | null {
    const decoded = this.decodeSignedPayload<Record<string, unknown>>(
      signedTransactionInfo,
    );
    const environment = this.normalizeEnvironment(decoded?.environment);
    return this.getVerifierForEnvironment(environment);
  }

  private resolveNotificationVerifier(
    signedPayload: string,
  ): SignedDataVerifier | null {
    const decoded =
      this.decodeSignedPayload<Record<string, unknown>>(signedPayload);
    const payloadEnvironment = this.extractNotificationEnvironment(decoded);
    return this.getVerifierForEnvironment(payloadEnvironment);
  }

  private getVerifierForEnvironment(
    environment: Environment | null,
  ): SignedDataVerifier | null {
    if (environment && this.verifiers.has(environment)) {
      return this.verifiers.get(environment) ?? null;
    }

    if (this.verificationEnvironment !== 'Auto' && this.verifiers.size === 1) {
      return Array.from(this.verifiers.values())[0] ?? null;
    }

    return null;
  }

  private decodeSignedPayload<T>(jwt: string): T | null {
    try {
      const [, payload] = jwt.split('.');
      if (!payload) return null;
      return JSON.parse(
        Buffer.from(payload, 'base64url').toString('utf8'),
      ) as T;
    } catch {
      return null;
    }
  }

  private extractNotificationEnvironment(
    decoded: Record<string, unknown> | null,
  ): Environment | null {
    if (!decoded) return null;

    const sources = [decoded.data, decoded.summary, decoded.appData] as Array<
      Record<string, unknown> | undefined
    >;

    for (const source of sources) {
      const environment = this.normalizeEnvironment(source?.environment);
      if (environment) {
        return environment;
      }
    }

    const externalPurchaseToken = decoded.externalPurchaseToken as
      | Record<string, unknown>
      | undefined;
    const externalPurchaseId =
      typeof externalPurchaseToken?.externalPurchaseId === 'string'
        ? externalPurchaseToken.externalPurchaseId
        : null;
    if (!externalPurchaseId) {
      return null;
    }

    return externalPurchaseId.startsWith('SANDBOX')
      ? Environment.SANDBOX
      : Environment.PRODUCTION;
  }

  private normalizeEnvironment(value: unknown): Environment | null {
    switch (value) {
      case Environment.SANDBOX:
        return Environment.SANDBOX;
      case Environment.PRODUCTION:
        return Environment.PRODUCTION;
      case Environment.XCODE:
        return Environment.XCODE;
      case Environment.LOCAL_TESTING:
        return Environment.LOCAL_TESTING;
      default:
        return null;
    }
  }

  /**
   * Returns the current subscription status for a user.
   */
  async getSubscriptionStatus(userId: number): Promise<SubscriptionStatusDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        subscriptionStatus: true,
        subscriptionProductId: true,
        subscriptionExpiresAt: true,
        autoRenewEnabled: true,
        gracePeriodExpiresAt: true,
      },
    });

    if (!user) {
      return {
        status: SubscriptionStatus.NONE,
        tier: SubscriptionTier.FREE,
        productId: null,
        expiresAt: null,
        autoRenewEnabled: false,
        gracePeriodExpiresAt: null,
      };
    }

    const effective = effectiveSubscriptionStatus(user);

    return {
      status: effective,
      tier: await this.resolveTier(userId, user),
      productId: user.subscriptionProductId,
      expiresAt: user.subscriptionExpiresAt?.toISOString() ?? null,
      autoRenewEnabled: user.autoRenewEnabled,
      gracePeriodExpiresAt: user.gracePeriodExpiresAt?.toISOString() ?? null,
    };
  }

  /**
   * Resolves the user's effective subscription tier. `pay_once` (non-consumable)
   * outranks any subscription SKU; an expired/revoked sub or unknown SKU falls
   * back to free. Mirrors `VideoExtractionQuotaService.resolveTier` and the iOS
   * `StoreManager` precedence so all three platforms agree.
   */
  async resolveTier(
    userId: number,
    user?: {
      subscriptionStatus: SubscriptionStatus;
      subscriptionProductId: string | null;
      subscriptionExpiresAt?: Date | null;
    } | null,
  ): Promise<SubscriptionTier> {
    const resolved =
      user ??
      (await this.prisma.user.findUnique({
        where: { id: userId },
        select: {
          subscriptionStatus: true,
          subscriptionProductId: true,
          subscriptionExpiresAt: true,
        },
      }));
    if (!resolved) return SubscriptionTier.FREE;

    // pay_once is non-consumable — it does not drive `subscriptionStatus`.
    // Check the transactions table directly for an unrevoked pay_once row.
    const payOnce = await this.prisma.subscriptionTransaction.findFirst({
      where: { userId, productId: PAY_ONCE_SKU, revocationDate: null },
      select: { id: true },
    });
    if (payOnce) return SubscriptionTier.PAY_ONCE;

    // Nothing currently flips subscriptionStatus to EXPIRED once a Google
    // Play renewal lapses (no RTDN/webhook wired — see PR body), so a stored
    // ACTIVE row can be stale. isEntitledToPro is the single shared guard
    // for that (see its doc comment for why only ACTIVE, never
    // GRACE_PERIOD/BILLING_RETRY, is collapsed).
    const entitled = isEntitledToPro({
      subscriptionStatus: resolved.subscriptionStatus,
      subscriptionExpiresAt: resolved.subscriptionExpiresAt ?? null,
    });

    if (
      entitled &&
      resolved.subscriptionProductId &&
      SUBSCRIPTION_SKUS.has(resolved.subscriptionProductId)
    ) {
      return resolved.subscriptionProductId as SubscriptionTier;
    }
    return SubscriptionTier.FREE;
  }

  /**
   * Verifies a Google Play purchase token (subscription or non-consumable),
   * acknowledges it so Google does not auto-refund after 3 days, updates the
   * user's entitlement, logs a transaction row, then returns the resolved
   * status. Android parity with the iOS `validateTransaction` (JWS) path.
   */
  async verifyPlayPurchase(
    userId: number,
    dto: VerifyPlayPurchaseDto,
  ): Promise<SubscriptionStatusDto> {
    if (!this.playVerifier.isConfigured()) {
      throw new BadRequestException(
        'Google Play purchase verification is not configured',
      );
    }

    const isPayOnce = dto.productId === PAY_ONCE_SKU;

    // Consumable scan-credit packs (oneplan.video_scan_1/5/15/30, legacy
    // scan_pack_* aliases) are routed to a dedicated path BEFORE the
    // subscription/pay_once allowlist gate below — they are not in
    // SUBSCRIPTION_SKUS and must never flow through the subscription-status
    // branch (see the Apple `isCreditProduct` branch's comment for why: no
    // expiresDate -> would derive ACTIVE and clobber the user's real
    // subscription). pay_once is excluded even though
    // scanCredit.isCreditProduct() also matches it — Play's pay_once keeps
    // its existing ledger-only handling further down, unchanged.
    if (!isPayOnce && this.scanCredit.isCreditProduct(dto.productId)) {
      return this.verifyPlayCreditPackPurchase(userId, dto);
    }

    // Allowlist gate: only our own Pro SKUs may grant entitlement. Without
    // this, a valid Google token for ANY other subscription product in the
    // Play account would be classified as a subscription and flip the user
    // to ACTIVE (entitlement/revenue bypass). pay_once is the only one-time
    // SKU; everything else must be an auto-renewing Pro SKU.
    if (!isPayOnce && !SUBSCRIPTION_SKUS.has(dto.productId)) {
      throw new BadRequestException('Unsupported product');
    }

    const kind: PlayPurchaseKind = isPayOnce ? 'product' : 'subscription';
    const verified = await this.playVerifier.verifyAndAcknowledge(dto, kind);

    // Server test-purchase guard (mirrors APP_STORE_ENVIRONMENT): one shared
    // Play app/product set backs both dev- and prod-pointed builds, so a
    // license-tester purchase is otherwise indistinguishable from a real one.
    // In Production, a test purchase must not grant Pro or leave a ledger
    // row — but this must resolve, not throw, or the client's launch
    // reconcile (which only retries on failure) would retry-loop forever.
    const playEnvironment = this.configService.get<string>(
      'GOOGLE_PLAY_ENVIRONMENT',
      'Production',
    );
    if (playEnvironment === 'Production' && verified.isTest === true) {
      this.logger.warn(
        `Rejected Google Play TEST purchase in Production environment: ` +
          `product=${verified.productId}, token=${verified.purchaseToken.slice(0, 8)}…`,
      );
      return this.getSubscriptionStatus(userId);
    }

    const now = new Date();
    let status: SubscriptionStatus;
    if (verified.active && verified.acknowledged) {
      status = SubscriptionStatus.ACTIVE;
    } else if (verified.active && !verified.acknowledged) {
      // The purchase is valid but Google did not accept the acknowledgement
      // (transient API failure). An UNACKNOWLEDGED purchase is auto-refunded
      // by Google after 3 days, so we must NOT grant a durable entitlement.
      // Fail closed (mirrors the iOS "don't finish the transaction on
      // validation failure" contract) so the client retries and Google
      // eventually receives the acknowledgement.
      throw new ServiceUnavailableException(
        'Purchase verified but could not be acknowledged; please try again',
      );
    } else {
      // Covers both a plain lapse and `verified.revoked` (subscription
      // expired after the user cancelled it) — for a subscription that is
      // the normal end of life, not a refund, so it belongs in EXPIRED, not
      // REVOKED. REVOKED is reserved for a genuine store-side refund/
      // chargeback (Apple's revocationDate; Play's voidedPurchaseNotification
      // handled separately in handlePlayWebhook). See PlayStoreAdapter.toStoreEvent
      // for why `revoked` can't just be checked here directly.
      status = SubscriptionStatus.EXPIRED;
    }

    if (kind === 'subscription') {
      await this.prisma.user.update({
        where: { id: userId },
        data: {
          subscriptionStatus: status,
          subscriptionProductId: verified.productId,
          subscriptionExpiresAt: verified.expiresAt,
          // Use the purchase token as the cross-platform original-transaction
          // id so RTDN/restore can locate the user later. Unique per purchase.
          originalTransactionId: verified.purchaseToken,
          autoRenewEnabled: verified.active && !verified.revoked,
          gracePeriodExpiresAt: null,
        },
      });
    } else {
      // pay_once: non-consumable, does not drive subscriptionStatus. Only the
      // transaction ledger row grants the tier (mirrors Apple pay_once path).
      // Do not overwrite an active subscription's status fields.
    }

    await this.storeEventProcessor.process(
      this.playAdapter.toStoreEvent({
        verified,
        source: 'CLIENT_VERIFY',
        userId,
        status,
        isCreditProduct: this.scanCredit.isCreditProduct(dto.productId),
      }),
    );
    await this.storeEventProcessor.replayOrphans(
      verified.purchaseToken,
      userId,
    );

    if (status === SubscriptionStatus.ACTIVE) {
      void this.analytics.track(ANALYTICS_EVENTS.SUBSCRIPTION_STARTED, {
        userId,
        properties: {
          productId: verified.productId,
          platform: 'android',
          orderId: verified.orderId,
        },
      });
    }

    this.logger.log(
      `Verified Play purchase for user ${userId}: product=${verified.productId}, ` +
        `status=${status}, acknowledged=${verified.acknowledged}, at=${now.toISOString()}`,
    );

    return this.getSubscriptionStatus(userId);
  }

  /**
   * Verifies + grants a Google Play consumable scan-credit pack purchase.
   * Split out from the subscription/pay_once flow above: a credit pack is
   * always Play `kind: 'product'`, never writes `subscriptionStatus` /
   * `subscriptionProductId` / `subscriptionExpiresAt` (mirrors the Apple
   * `isCreditProduct` branch), and its idempotency key is the Play
   * `purchaseToken` — reusing `ScanCreditService.grantPurchase`'s existing
   * `(userId, externalRef)` partial unique index dedupe, exactly like the
   * Apple transactionId path. A NEW purchaseToken (i.e. a legitimate repeat
   * purchase of the same SKU after the client consumes the prior one) is a
   * different externalRef, so it grants again rather than being deduped.
   */
  private async verifyPlayCreditPackPurchase(
    userId: number,
    dto: VerifyPlayPurchaseDto,
  ): Promise<SubscriptionStatusDto> {
    const verified = await this.playVerifier.verifyAndAcknowledge(
      dto,
      'product',
    );

    // Same test-purchase guard as the subscription/pay_once path above: one
    // shared Play product set backs both dev- and prod-pointed builds, so a
    // license-tester purchase must not grant real credits in Production —
    // but must resolve, not throw, so the client doesn't retry-loop.
    const playEnvironment = this.configService.get<string>(
      'GOOGLE_PLAY_ENVIRONMENT',
      'Production',
    );
    if (playEnvironment === 'Production' && verified.isTest === true) {
      this.logger.warn(
        `Rejected Google Play TEST credit-pack purchase in Production environment: ` +
          `product=${verified.productId}, token=${verified.purchaseToken.slice(0, 8)}…`,
      );
      return this.getSubscriptionStatus(userId);
    }

    if (!verified.active) {
      // Cancelled/refunded before we could grant it — nothing to do.
      return this.getSubscriptionStatus(userId);
    }

    if (!verified.acknowledged) {
      // Unacknowledged purchases are auto-refunded by Google after 3 days;
      // fail closed so the client retries and Google eventually receives the
      // acknowledgement (mirrors the subscription path's contract).
      throw new ServiceUnavailableException(
        'Purchase verified but could not be acknowledged; please try again',
      );
    }

    await this.scanCredit.grantPurchase(
      userId,
      verified.productId,
      verified.purchaseToken,
      verified.isTest ? 'Sandbox' : 'Production',
    );

    this.logger.log(
      `Verified Play credit-pack purchase for user ${userId}: ` +
        `product=${verified.productId}, token=${verified.purchaseToken.slice(0, 8)}…`,
    );

    return this.getSubscriptionStatus(userId);
  }

  /**
   * Handles Google Play Real-Time Developer Notifications (RTDN).
   */
  async handlePlayWebhook(payload: PlayWebhookPayloadDto): Promise<void> {
    const notification = this.playAdapter.parseDeveloperNotification(
      payload.message.data,
    );
    if (!notification) {
      throw new BadRequestException('Invalid or unparsable base64 RTDN data');
    }

    if (notification.testNotification) {
      this.logger.log(
        `Received Play TEST notification for package ${notification.packageName}`,
      );
      return;
    }

    const eventId = payload.message.messageId;

    // Dedupe check — read-only. Row creation/ownership belongs to
    // StoreEventProcessor.persist() (and, for the branches below that never
    // reach the processor, to completeNotification/failNotification).
    // Pre-creating the row here would make StoreEventProcessor.process()'s
    // own dedupe check see it and treat every first attempt as a duplicate,
    // skipping entitlement.apply() entirely — that was the root cause of
    // RTDN being acked 200 while subscription_expires_at never advanced.
    const existing = await this.prisma.storeNotification.findUnique({
      where: { notificationUUID: eventId },
      select: { outcome: true },
    });
    if (existing?.outcome === 'PROCESSED') {
      this.logger.log(`Ignoring duplicate Play RTDN ${eventId}`);
      return;
    }

    // 1. Check if it's a VoidedPurchaseNotification (Refund)
    if (notification.voidedPurchaseNotification) {
      const isCreditProduct =
        notification.voidedPurchaseNotification.productType === 1; // 1 = inapp (consumable)
      const refundEvent = this.playAdapter.createRefundEventFromNotification(
        notification,
        eventId,
        isCreditProduct,
      );
      if (refundEvent) {
        if (isCreditProduct) {
          // Play voided notifications only contain orderId, no productId.
          // However, scanCredit.revokePurchase accepts (originalTransactionId, transactionId) which are both purchaseToken on Android
          const token = notification.voidedPurchaseNotification.purchaseToken;
          const result = await this.scanCredit.revokePurchase(token, token);
          if (result?.userId && result.applied) {
            void this.analytics.track(ANALYTICS_EVENTS.SCAN_PACK_REFUNDED, {
              userId: result.userId,
              properties: {
                outcome: 'revoked',
                transactionId: token,
                originalTransactionId: token,
                notificationType:
                  notification.voidedPurchaseNotification.refundType,
                grantedAmount: result.grantedAmount,
                clawedBack: result.clawedBack,
                consumedAtRefund: result.consumedAtRefund,
                restored: result.restored,
                reclaimedPct: Math.round(
                  (result.clawedBack / (result.grantedAmount || 1)) * 100,
                ),
                consumedPct: Math.round(
                  (result.consumedAtRefund / (result.grantedAmount || 1)) * 100,
                ),
                revocationReason:
                  notification.voidedPurchaseNotification.refundType,
              },
            });
          }
          await this.completeNotification(
            eventId,
            undefined,
            result?.userId,
            'GOOGLE',
            notification,
          );
        } else {
          // Handle subscription refund. storeEventProcessor.process() already
          // persists its own terminal outcome (with the correct store,
          // userId, rawPayload) — do not stomp it with a second write below.
          await this.storeEventProcessor.process(refundEvent);
        }
        return;
      }
    }

    // 2. Resolve the token and product from the notification
    let purchaseToken: string | null = null;
    let productId: string | null = null;

    if (notification.subscriptionNotification) {
      purchaseToken = notification.subscriptionNotification.purchaseToken;
      productId = notification.subscriptionNotification.subscriptionId ?? null;
    } else if (notification.oneTimeProductNotification) {
      purchaseToken = notification.oneTimeProductNotification.purchaseToken;
      productId = notification.oneTimeProductNotification.sku;
    }

    if (!purchaseToken || !productId) {
      this.logger.warn(`Received Play RTDN with no actionable purchase info`);
      await this.completeNotification(
        eventId,
        undefined,
        undefined,
        'GOOGLE',
        notification,
      );
      return;
    }

    // 3. Verify the token with Google Play APIs to get current status and linkedPurchaseToken
    const isPayOnce = productId === PAY_ONCE_SKU;
    const isCreditProduct = this.scanCredit.isCreditProduct(productId);
    const kind = isPayOnce || isCreditProduct ? 'product' : 'subscription';

    let verified;
    try {
      // NOTE: verifyAndAcknowledge will acknowledge unacknowledged purchases.
      // This is generally desirable for RTDNs of new purchases.
      verified = await this.playVerifier.verifyAndAcknowledge(
        { productId, purchaseToken, packageName: notification.packageName },
        kind,
      );
    } catch (err) {
      this.logger.error(`Failed to verify Play RTDN token`, err);
      await this.failNotification(
        eventId,
        'Verification API failed',
        'GOOGLE',
        notification,
      );
      throw new ServiceUnavailableException('Play API Verification Failed');
    }

    const linkedPurchaseToken = (verified as any).linkedPurchaseToken as
      | string
      | undefined; // We'll add this to GooglePlaySubscriptionVerifierService

    // Determine status for subscriptions
    let status: SubscriptionStatus | undefined;
    if (kind === 'subscription') {
      if (verified.active && verified.acknowledged) {
        status = SubscriptionStatus.ACTIVE;
      } else if (verified.active && !verified.acknowledged) {
        // We throw so it retries, or we could just skip. Let's throw to retry.
        throw new ServiceUnavailableException(
          'Purchase verified but unacknowledged',
        );
      } else {
        // Includes `verified.revoked` (cancelled subscription that has now
        // expired) — the normal end of life of a cancellation, not a refund.
        // See the CLIENT_VERIFY branch above / PlayStoreAdapter.toStoreEvent
        // for the full reasoning; REVOKED stays reserved for a genuine
        // refund/chargeback signal.
        status = SubscriptionStatus.EXPIRED;
      }
    }

    // Process event
    await this.storeEventProcessor.process(
      this.playAdapter.toStoreEvent({
        verified,
        source: 'NOTIFICATION',
        status,
        isCreditProduct,
        eventId,
        raw: notification,
        linkedPurchaseToken,
        notificationType: resolvePlayNotificationType(notification),
      }),
    );

    // If it's a subscription and it had a linked token, replay orphans for the NEW token
    // because any verifies that came in for the new token before this RTDN arrived were orphaned
    if (verified.linkedPurchaseToken) {
      await this.storeEventProcessor.replayOrphans(verified.purchaseToken);
    }

    // storeEventProcessor.process() above already persisted the terminal
    // outcome (PROCESSED/ORPHANED) with the correct store/userId/rawPayload —
    // do not stomp it back to PROCESSED here (that was the bug: an ORPHANED
    // event, or one processed by a concurrent redelivery, would get
    // overwritten to a false PROCESSED with the transaction ids nulled out).
  }

  private mapAppleStatusToSubscriptionStatus(
    appleStatus: Status | number | undefined,
  ): SubscriptionStatus {
    switch (appleStatus) {
      case Status.ACTIVE:
      case 1:
        return SubscriptionStatus.ACTIVE;
      case Status.EXPIRED:
      case 2:
        return SubscriptionStatus.EXPIRED;
      case Status.BILLING_RETRY:
      case 3:
        return SubscriptionStatus.BILLING_RETRY;
      case Status.BILLING_GRACE_PERIOD:
      case 4:
        return SubscriptionStatus.GRACE_PERIOD;
      case Status.REVOKED:
      case 5:
        return SubscriptionStatus.REVOKED;
      default:
        return SubscriptionStatus.NONE;
    }
  }

  private async logTransaction(
    userId: number,
    transaction: JWSTransactionDecodedPayload,
    notificationType: string | null,
    notificationUUID: string | null,
    signedDate?: Date | null,
  ): Promise<void> {
    const data = {
      userId,
      transactionId: transaction.transactionId ?? '',
      originalTransactionId: transaction.originalTransactionId ?? '',
      productId: transaction.productId ?? '',
      purchaseDate: transaction.purchaseDate
        ? new Date(transaction.purchaseDate)
        : new Date(),
      expiresDate: transaction.expiresDate
        ? new Date(transaction.expiresDate)
        : null,
      revocationDate: transaction.revocationDate
        ? new Date(transaction.revocationDate)
        : null,
      notificationType,
      notificationUUID,
      signedDate: signedDate ?? null,
      environment:
        transaction.environment === 'Production' ? 'Production' : 'Sandbox',
      ownershipType: transaction.type,
    };
    try {
      await this.prisma.subscriptionTransaction.create({ data });
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        // Local StoreKit (Xcode .storekit / SKTestSession) reuses a
        // deterministic transactionId across dev accounts. The
        // SubscriptionTransaction.transactionId @unique then makes this
        // create collide with a PRIOR dev account's row — and silently
        // swallowing it leaves THIS user with no transaction row, so the
        // per-transaction Pro scan-credit reconcile (computeProSchedule
        // findMany by userId) finds nothing and grants zero credits.
        // Reassign the row to the caller, mirroring the same local-StoreKit
        // id-reuse handling already applied to User.originalTransactionId in
        // assertSubscriptionBelongsToCaller. Unreachable in production: real
        // Sandbox/Production transactionIds are globally unique and an Xcode
        // JWS fails the prod verifier.
        const isLocalStoreKit =
          transaction.environment === Environment.XCODE ||
          transaction.environment === Environment.LOCAL_TESTING;
        if (isLocalStoreKit && transaction.transactionId) {
          try {
            await this.prisma.subscriptionTransaction.update({
              where: { transactionId: transaction.transactionId },
              data,
            });
            this.logger.warn(
              `Reassigned local StoreKit transaction ${transaction.transactionId} to user ${userId}`,
            );
            return;
          } catch (reassignError) {
            this.logger.error(
              'Failed to reassign local StoreKit transaction',
              reassignError,
            );
            return;
          }
        }
        this.logger.log(
          `Duplicate transaction ${transaction.transactionId} ignored`,
        );
        return;
      }
      // Fail closed: Apple has already granted/renewed the purchase by this
      // point, so swallowing here would strand the user paid-but-not-
      // entitled. Rethrow so the caller (validateTransaction / handleWebhook)
      // surfaces a failure and the client retries — safe because this insert
      // is idempotent by transactionId (P2002 branch above).
      this.logger.error('Failed to log transaction', error);
      throw error;
    }
  }

  private logTransactionWithoutUser(
    transaction: JWSTransactionDecodedPayload,
  ): void {
    // We cannot log without a user ID due to foreign key constraint
    // Just log a warning
    this.logger.warn(
      `Cannot log transaction ${transaction.transactionId} - no user found`,
    );
  }
}
