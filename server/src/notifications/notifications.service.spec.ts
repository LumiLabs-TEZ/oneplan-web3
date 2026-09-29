import { Test } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { ApnsPushAdapter } from './adapters/apns-push.adapter';
import { FcmPushAdapter } from './adapters/fcm-push.adapter';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminPushAudience,
  AdminPushDestination,
} from './dto/send-admin-push.dto';

describe('NotificationsService (router)', () => {
  let service: NotificationsService;
  let apns: { sendBatch: jest.Mock };
  let fcm: { sendBatch: jest.Mock };
  let prisma: any;

  beforeEach(async () => {
    apns = { sendBatch: jest.fn().mockResolvedValue({ invalidTokens: [] }) };
    fcm = { sendBatch: jest.fn().mockResolvedValue({ invalidTokens: [] }) };
    prisma = {
      deviceToken: {
        findMany: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn(),
      },
      trip: { findUnique: jest.fn().mockResolvedValue({ name: 'Da Lat' }) },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: ApnsPushAdapter, useValue: apns },
        { provide: FcmPushAdapter, useValue: fcm },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(NotificationsService);
  });

  it('fans tokens by platform for chat push', async () => {
    prisma.deviceToken.findMany.mockResolvedValue([
      { token: 'ios1', platform: 'ios', user: { locale: 'EN' } },
      { token: 'android1', platform: 'android', user: { locale: 'EN' } },
      { token: 'ios2', platform: 'ios', user: { locale: 'EN' } },
    ]);
    await service.sendChatPush(7, 99, 'Alice', 'hello', []);
    expect(apns.sendBatch).toHaveBeenCalledWith(
      ['ios1', 'ios2'],
      expect.objectContaining({ type: 'chat' }),
    );
    expect(fcm.sendBatch).toHaveBeenCalledWith(
      ['android1'],
      expect.objectContaining({ type: 'chat' }),
    );
  });

  it('deletes invalid tokens from both adapters in one batch', async () => {
    prisma.deviceToken.findMany.mockResolvedValue([
      { token: 'ios1', platform: 'ios', user: { locale: 'EN' } },
      { token: 'android1', platform: 'android', user: { locale: 'EN' } },
    ]);
    apns.sendBatch.mockResolvedValue({ invalidTokens: ['ios1'] });
    fcm.sendBatch.mockResolvedValue({ invalidTokens: ['android1'] });
    await service.sendFriendRequestPush(42, 'Bob');
    expect(prisma.deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['ios1', 'android1'] } },
    });
  });

  it('skips dispatch when no tokens', async () => {
    prisma.deviceToken.findMany.mockResolvedValue([]);
    await service.sendFriendRequestPush(42, 'Bob');
    expect(apns.sendBatch).not.toHaveBeenCalled();
    expect(fcm.sendBatch).not.toHaveBeenCalled();
  });

  it('trip_invite skips when invitee is online', async () => {
    await service.sendTripInvitePush(42, 'I', 'T', 'CODE', [42, 99]);
    expect(prisma.deviceToken.findMany).not.toHaveBeenCalled();
  });

  it('sendTripStartedPush targets the given members with a trip_started payload', async () => {
    prisma.deviceToken.findMany.mockResolvedValue([
      { token: 'ios1', platform: 'ios', user: { locale: 'EN' } },
    ]);
    await service.sendTripStartedPush(7, 'Da Lat', [1, 2]);
    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { in: [1, 2] } } }),
    );
    expect(apns.sendBatch).toHaveBeenCalledWith(
      ['ios1'],
      expect.objectContaining({
        type: 'trip_started',
        title: 'Da Lat',
        data: { tripId: '7' },
      }),
    );
  });

  it('sendTripAutoStartBlockedPush targets only the creator', async () => {
    prisma.deviceToken.findMany.mockResolvedValue([
      { token: 'ios1', platform: 'ios', user: { locale: 'VN' } },
    ]);
    await service.sendTripAutoStartBlockedPush(1, 7, 'Da Lat', ['Ann']);
    expect(prisma.deviceToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 1 } }),
    );
    expect(apns.sendBatch).toHaveBeenCalledWith(
      ['ios1'],
      expect.objectContaining({
        type: 'trip_auto_start_blocked',
        body: expect.stringContaining('Ann'),
        data: { tripId: '7' },
      }),
    );
  });
});

// Admin push: token resolution + result accounting live in the service; the
// raw APNs send (payload/badge/chunking) moved into ApnsPushAdapter, so here we
// inject a fake adapter and assert the service drives it correctly.
describe('NotificationsService.sendAdminPush', () => {
  let deviceToken: { findMany: jest.Mock; deleteMany: jest.Mock };
  let user: { findMany: jest.Mock };
  let prisma: PrismaService;
  let apns: {
    isConfigured: boolean;
    sendAdminBroadcast: jest.Mock;
  };
  let fcm: {
    isConfigured: boolean;
    sendAdminBroadcast: jest.Mock;
    sendBatch: jest.Mock;
  };
  let service: NotificationsService;

  const buildService = (
    apnsConfigured: boolean,
    fcmConfigured = false,
  ): NotificationsService => {
    apns = {
      isConfigured: apnsConfigured,
      sendAdminBroadcast: jest
        .fn()
        .mockResolvedValue({ sent: 0, failed: 0, invalidTokens: [] }),
    };
    fcm = {
      isConfigured: fcmConfigured,
      sendAdminBroadcast: jest
        .fn()
        .mockResolvedValue({ sent: 0, failed: 0, invalidTokens: [] }),
      sendBatch: jest.fn(),
    };
    return new NotificationsService(
      prisma,
      apns as unknown as ApnsPushAdapter,
      fcm as unknown as FcmPushAdapter,
    );
  };

  beforeEach(() => {
    deviceToken = {
      findMany: jest.fn(),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    user = { findMany: jest.fn() };
    prisma = { deviceToken, user } as unknown as PrismaService;
  });

  it('throws when neither APNs nor FCM is configured', async () => {
    service = buildService(false, false);
    await expect(
      service.sendAdminPush({
        audience: AdminPushAudience.ALL,
        title: 'Hi',
        body: 'There',
      }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('broadcasts iOS tokens to APNs and Android tokens to FCM (board destination)', async () => {
    service = buildService(true, true);
    deviceToken.findMany.mockResolvedValue([
      { token: 'ios-a', platform: 'ios' },
      { token: 'ios-b', platform: 'ios' },
      { token: 'android-c', platform: 'android' },
    ]);
    apns.sendAdminBroadcast.mockResolvedValue({
      sent: 2,
      failed: 0,
      invalidTokens: [],
    });
    fcm.sendAdminBroadcast.mockResolvedValue({
      sent: 1,
      failed: 0,
      invalidTokens: [],
    });

    const result = await service.sendAdminPush({
      audience: AdminPushAudience.ALL,
      title: 'Hi',
      body: 'There',
      destination: AdminPushDestination.BOARD,
    });

    expect(user.findMany).not.toHaveBeenCalled();
    expect(apns.sendAdminBroadcast).toHaveBeenCalledWith(['ios-a', 'ios-b'], {
      title: 'Hi',
      body: 'There',
      destination: AdminPushDestination.BOARD,
    });
    expect(fcm.sendAdminBroadcast).toHaveBeenCalledWith(['android-c'], {
      title: 'Hi',
      body: 'There',
      destination: AdminPushDestination.BOARD,
    });
    expect(result).toEqual({
      recipientDevices: 3,
      sent: 3,
      failed: 0,
      unknownRecipients: [],
    });
  });

  it('succeeds via FCM-only when APNs is not configured', async () => {
    service = buildService(false, true);
    deviceToken.findMany.mockResolvedValue([
      { token: 'android-x', platform: 'android' },
    ]);
    fcm.sendAdminBroadcast.mockResolvedValue({
      sent: 1,
      failed: 0,
      invalidTokens: [],
    });

    const result = await service.sendAdminPush({
      audience: AdminPushAudience.ALL,
      title: 'Hi',
      body: 'There',
    });

    expect(apns.sendAdminBroadcast).toHaveBeenCalledWith(
      [],
      expect.any(Object),
    );
    expect(fcm.sendAdminBroadcast).toHaveBeenCalledWith(
      ['android-x'],
      expect.any(Object),
    );
    expect(result.sent).toBe(1);
  });

  it('resolves targeted recipients by id and lowercased email, reporting unknowns', async () => {
    service = buildService(true, false);
    // Jane (id 42) is known; ghost + notanemail are not.
    user.findMany.mockResolvedValue([{ id: 42, email: 'jane@example.com' }]);
    deviceToken.findMany.mockResolvedValue([{ token: 't1', platform: 'ios' }]);
    apns.sendAdminBroadcast.mockResolvedValue({
      sent: 1,
      failed: 0,
      invalidTokens: [],
    });

    const result = await service.sendAdminPush({
      audience: AdminPushAudience.TARGETED,
      title: 'Hi',
      body: 'There',
      recipients: ['Jane@Example.com', '42', ' ', 'ghost@x.com', 'notanemail'],
    });

    // Email lookup normalized to lowercase; ids parsed from numeric strings.
    expect(user.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { id: { in: [42] } },
          { email: { in: ['jane@example.com', 'ghost@x.com', 'notanemail'] } },
        ],
      },
      select: { id: true, email: true },
    });
    expect(deviceToken.findMany).toHaveBeenCalledWith({
      where: { userId: { in: [42] } },
      select: { token: true, platform: true },
    });
    expect(result.recipientDevices).toBe(1);
    expect(result.sent).toBe(1);
    expect(result.unknownRecipients).toEqual(['ghost@x.com', 'notanemail']);
  });

  it('prunes invalid tokens reported by both adapters', async () => {
    service = buildService(true, true);
    deviceToken.findMany.mockResolvedValue([
      { token: 'ios-good', platform: 'ios' },
      { token: 'ios-dead', platform: 'ios' },
      { token: 'android-dead', platform: 'android' },
    ]);
    apns.sendAdminBroadcast.mockResolvedValue({
      sent: 1,
      failed: 1,
      invalidTokens: ['ios-dead'],
    });
    fcm.sendAdminBroadcast.mockResolvedValue({
      sent: 0,
      failed: 1,
      invalidTokens: ['android-dead'],
    });

    const result = await service.sendAdminPush({
      audience: AdminPushAudience.ALL,
      title: 'Hi',
      body: 'There',
    });

    expect(deviceToken.deleteMany).toHaveBeenCalledWith({
      where: { token: { in: ['ios-dead', 'android-dead'] } },
    });
    expect(result).toEqual({
      recipientDevices: 3,
      sent: 1,
      failed: 2,
      unknownRecipients: [],
    });
  });

  it('filters by platform when dto.platform is set', async () => {
    service = buildService(false, true);
    deviceToken.findMany.mockResolvedValue([
      { token: 'android-1', platform: 'android' },
    ]);
    fcm.sendAdminBroadcast.mockResolvedValue({
      sent: 1,
      failed: 0,
      invalidTokens: [],
    });

    await service.sendAdminPush({
      audience: AdminPushAudience.ALL,
      title: 'Hi',
      body: 'There',
      platform: 'android',
    });

    expect(deviceToken.findMany).toHaveBeenCalledWith({
      where: { platform: 'android' },
      select: { token: true, platform: true },
    });
  });
});
