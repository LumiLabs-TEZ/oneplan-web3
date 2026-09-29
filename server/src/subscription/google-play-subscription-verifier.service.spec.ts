import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GooglePlayPurchaseClient } from '../google-play/google-play-purchase-client';
import { GooglePlaySubscriptionVerifierService } from './google-play-subscription-verifier.service';

jest.mock('google-auth-library', () => ({
  GoogleAuth: jest.fn().mockImplementation(() => ({
    getClient: jest.fn().mockResolvedValue({
      getAccessToken: jest.fn().mockResolvedValue({ token: 'access-token' }),
    }),
  })),
}));

describe('GooglePlaySubscriptionVerifierService', () => {
  let service: GooglePlaySubscriptionVerifierService;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;

    const config = {
      get: jest.fn((key: string) => {
        const map: Record<string, string> = {
          GOOGLE_PLAY_PACKAGE_NAME: 'com.oneplan.app',
          GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL: 'svc@oneplan.iam',
          GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY: 'pk\\nline',
        };
        return map[key];
      }),
    };
    const play = new GooglePlayPurchaseClient(
      config as unknown as ConfigService,
    );
    service = new GooglePlaySubscriptionVerifierService(play);
  });

  const dto = {
    packageName: 'com.oneplan.app',
    productId: 'pro_yearly',
    purchaseToken: 'tok-1',
    orderId: 'GPA.1',
    purchaseTimeMillis: undefined,
    purchaseState: 0,
  };

  it('isConfigured returns true when all creds present', () => {
    expect(service.isConfigured()).toBe(true);
  });

  it('rejects a package mismatch before any network call', async () => {
    await expect(
      service.verifyAndAcknowledge(
        { ...dto, packageName: 'com.evil.app' },
        'subscription',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('verifies an active subscription and acknowledges when not yet acknowledged', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          startTimeMillis: '1700000000000',
          expiryTimeMillis: String(Date.now() + 86400000),
          orderId: 'GPA.1',
          paymentState: 1,
          acknowledgementState: 0,
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await service.verifyAndAcknowledge(dto, 'subscription');

    expect(result.active).toBe(true);
    expect(result.revoked).toBe(false);
    expect(result.acknowledged).toBe(true);
    // get + acknowledge
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain(':acknowledge');
    expect(fetchMock.mock.calls[1][1].method).toBe('POST');
  });

  it('keeps a grace-period subscription (paymentState 0, not yet expired) active', async () => {
    // Card retry mid-cycle: payment is pending (0) but expiry is in the future.
    // The user must NOT be locked out. Nothing new to acknowledge, so no POST.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        expiryTimeMillis: String(Date.now() + 86400000),
        paymentState: 0,
        acknowledgementState: 1,
      }),
    });

    const result = await service.verifyAndAcknowledge(dto, 'subscription');

    expect(result.active).toBe(true);
    expect(result.revoked).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not re-acknowledge an already-acknowledged subscription', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        expiryTimeMillis: String(Date.now() + 86400000),
        paymentState: 1,
        acknowledgementState: 1,
      }),
    });

    const result = await service.verifyAndAcknowledge(dto, 'subscription');

    expect(result.acknowledged).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('flags an expired + cancelled subscription as revoked and inactive', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        expiryTimeMillis: String(Date.now() - 86400000),
        userCancellationTimeMillis: String(Date.now() - 90000000),
        paymentState: 1,
        acknowledgementState: 1,
      }),
    });

    const result = await service.verifyAndAcknowledge(dto, 'subscription');

    expect(result.active).toBe(false);
    expect(result.revoked).toBe(true);
  });

  // Regression guard: the Play Billing Library (client-supplied dto.orderId)
  // reports the BASE order id without the "..N" renewal suffix — only the
  // Android Publisher REST API (sub.orderId) returns the per-cycle suffixed
  // form. Falling back to dto.orderId when sub.orderId is absent would hand
  // PlayStoreAdapter a constant id across renewals again, silently
  // reintroducing the single-grant-per-subscription bug.
  it('does NOT fall back to the client-supplied dto.orderId for a subscription when sub.orderId is absent', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          expiryTimeMillis: String(Date.now() + 86400000),
          paymentState: 1,
          acknowledgementState: 1,
          // No orderId in the Play API response.
        }),
    });

    const result = await service.verifyAndAcknowledge(
      { ...dto, orderId: 'GPA.1-client-base-no-suffix' },
      'subscription',
    );

    expect(result.orderId).toBeNull();
  });

  it('uses the Android Publisher (server-verified) orderId for a subscription, not the client one', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          expiryTimeMillis: String(Date.now() + 86400000),
          paymentState: 1,
          acknowledgementState: 1,
          orderId: 'GPA.1..1',
        }),
    });

    const result = await service.verifyAndAcknowledge(
      { ...dto, orderId: 'GPA.1-client-base-no-suffix' },
      'subscription',
    );

    expect(result.orderId).toBe('GPA.1..1');
  });

  it('throws when the subscription token is not found (404)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    await expect(
      service.verifyAndAcknowledge(dto, 'subscription'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('verifies and acknowledges a one-time product purchase', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          orderId: 'GPA.2',
          purchaseState: 0,
          purchaseTimeMillis: '1700000000000',
          acknowledgementState: 0,
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await service.verifyAndAcknowledge(
      { ...dto, productId: 'pay_once' },
      'product',
    );

    expect(result.kind).toBe('product');
    expect(result.active).toBe(true);
    expect(result.expiresAt).toBeNull();
    expect(result.acknowledged).toBe(true);
    expect(result.isTest).toBe(false);
  });

  it('flags a subscription with purchaseType 0 as a test purchase', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        expiryTimeMillis: String(Date.now() + 86400000),
        paymentState: 1,
        acknowledgementState: 1,
        purchaseType: 0,
      }),
    });

    const result = await service.verifyAndAcknowledge(dto, 'subscription');

    expect(result.isTest).toBe(true);
  });

  it('does not flag a promo subscription (purchaseType 1) as a test purchase', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        expiryTimeMillis: String(Date.now() + 86400000),
        paymentState: 1,
        acknowledgementState: 1,
        purchaseType: 1,
      }),
    });

    const result = await service.verifyAndAcknowledge(dto, 'subscription');

    expect(result.isTest).toBe(false);
  });

  it('flags a one-time product with purchaseType 0 as a test purchase', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          orderId: 'GPA.3',
          purchaseState: 0,
          purchaseTimeMillis: '1700000000000',
          acknowledgementState: 0,
          purchaseType: 0,
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const result = await service.verifyAndAcknowledge(
      { ...dto, productId: 'pay_once' },
      'product',
    );

    expect(result.isTest).toBe(true);
  });

  it('throws when a one-time product is still pending', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ purchaseState: 2 }),
    });

    await expect(
      service.verifyAndAcknowledge(
        { ...dto, productId: 'pay_once' },
        'product',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
