import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { FriendRequestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FriendsHandler } from '../realtime/handlers/friends.handler';
import { StorageService } from '../storage/storage.service';
import { FriendsService } from './friends.service';

describe('FriendsService', () => {
  let service: FriendsService;
  let prisma: Pick<
    PrismaService,
    'user' | 'friendRequest' | 'friendship' | 'trip' | '$queryRaw'
  >;
  let notifications: Pick<
    NotificationsService,
    'sendFriendRequestPush' | 'sendFriendAcceptedPush'
  >;
  let friendsHandler: Pick<
    FriendsHandler,
    'sendFriendRequest' | 'sendFriendRequestAccepted'
  >;
  let storageService: Pick<StorageService, 'getSignedThumbUrl'>;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
      },
      friendRequest: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      friendship: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        delete: jest.fn(),
      },
      trip: {
        count: jest.fn(),
        findMany: jest.fn(),
      },
      $queryRaw: jest.fn(),
      $transaction: jest.fn(),
    } as unknown as Pick<
      PrismaService,
      'user' | 'friendRequest' | 'friendship' | 'trip' | '$queryRaw'
    >;

    notifications = {
      sendFriendRequestPush: jest.fn(),
      sendFriendAcceptedPush: jest.fn(),
    };

    friendsHandler = {
      sendFriendRequest: jest.fn(),
      sendFriendRequestAccepted: jest.fn(),
    };

    storageService = {
      getSignedThumbUrl: jest.fn().mockResolvedValue({ url: null }),
    };

    service = new FriendsService(
      prisma as PrismaService,
      notifications as unknown as NotificationsService,
      friendsHandler as unknown as FriendsHandler,
      storageService as unknown as StorageService,
    );
  });

  // ── sendRequest ───────────────────────────────────────────────────

  describe('sendRequest', () => {
    it('sends a friend request and triggers push notification', async () => {
      const requestCreatedAt = new Date('2026-04-01T10:00:00.000Z');
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 2 }) // target user lookup
        .mockResolvedValueOnce({ displayName: 'Alice' }); // sender name lookup
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.upsert as jest.Mock).mockResolvedValue({
        id: 1,
        createdAt: requestCreatedAt,
        sender: {
          id: 1,
          displayName: 'Alice',
          avatarUrl: null,
          subscriptionStatus: null,
          createdAt: new Date('2025-03-01T00:00:00.000Z'),
        },
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: BigInt(0) }]);

      await service.sendRequest('FRIEND-CODE-2', 1);

      expect(prisma.friendRequest.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            senderId_receiverId: { senderId: 1, receiverId: 2 },
          },
          create: {
            senderId: 1,
            receiverId: 2,
            status: FriendRequestStatus.PENDING,
          },
          update: {
            status: FriendRequestStatus.PENDING,
          },
        }),
      );
      expect(notifications.sendFriendRequestPush).toHaveBeenCalledWith(
        2,
        'Alice',
      );
    });

    it('throws BadRequestException when sending request to yourself', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 1 });

      await expect(service.sendRequest('MY-CODE', 1)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendRequest('MY-CODE', 1)).rejects.toThrow(
        'Cannot send friend request to yourself',
      );
    });

    it('throws NotFoundException when friend code does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.sendRequest('NONEXISTENT', 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when already friends', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 2 });
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue({
        id: 10,
        userAId: 1,
        userBId: 2,
      });

      await expect(service.sendRequest('CODE-2', 1)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendRequest('CODE-2', 1)).rejects.toThrow(
        'You are already friends with this user',
      );
    });

    it('throws BadRequestException on duplicate pending request', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({ id: 2 });
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.findFirst as jest.Mock).mockResolvedValue({
        id: 5,
        senderId: 1,
        receiverId: 2,
        status: FriendRequestStatus.PENDING,
      });

      await expect(service.sendRequest('CODE-2', 1)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.sendRequest('CODE-2', 1)).rejects.toThrow(
        'A friend request already exists',
      );
    });

    it('uses "Someone" as display name when sender lookup returns null', async () => {
      const requestCreatedAt = new Date('2026-04-01T10:00:00.000Z');
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 2 }) // target user
        .mockResolvedValueOnce(null); // sender (null)
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.upsert as jest.Mock).mockResolvedValue({
        id: 1,
        createdAt: requestCreatedAt,
        sender: {
          id: 1,
          displayName: 'Someone',
          avatarUrl: null,
          subscriptionStatus: null,
          createdAt: new Date('2025-03-01T00:00:00.000Z'),
        },
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: BigInt(0) }]);

      await service.sendRequest('CODE-2', 1);

      expect(notifications.sendFriendRequestPush).toHaveBeenCalledWith(
        2,
        'Someone',
      );
    });
  });

  // ── respondToRequest ──────────────────────────────────────────────

  describe('respondToRequest', () => {
    it('accepts a request: deletes request, creates friendship with canonical order', async () => {
      // Sender (id=5) > Receiver (id=2), so canonical order is [2, 5]
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 99,
        senderId: 5,
        receiverId: 2,
        status: FriendRequestStatus.PENDING,
        receiver: { displayName: 'Bob' },
      });
      (prisma as any).$transaction = jest.fn().mockResolvedValue([]);

      await service.respondToRequest(99, 2, true);

      expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
      // Verify the individual Prisma calls made inside the transaction
      expect(prisma.friendRequest.delete).toHaveBeenCalledWith({
        where: { id: 99 },
      });
      expect(prisma.friendship.create).toHaveBeenCalledWith({
        data: { userAId: 2, userBId: 5 },
      });
      expect(notifications.sendFriendAcceptedPush).toHaveBeenCalledWith(
        5,
        'Bob',
      );
    });

    it('ensures canonical ordering: min userId is always userAId', async () => {
      // Sender (id=3) < Receiver (id=10), canonical order = [3, 10]
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 50,
        senderId: 3,
        receiverId: 10,
        status: FriendRequestStatus.PENDING,
        receiver: { displayName: 'Carol' },
      });
      (prisma as any).$transaction = jest.fn().mockResolvedValue([]);

      await service.respondToRequest(50, 10, true);

      expect(prisma.friendship.create).toHaveBeenCalledWith({
        data: { userAId: 3, userBId: 10 },
      });
    });

    it('declines a request: status becomes DECLINED', async () => {
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 99,
        senderId: 5,
        receiverId: 2,
        status: FriendRequestStatus.PENDING,
        receiver: { displayName: 'Bob' },
      });
      (prisma.friendRequest.update as jest.Mock).mockResolvedValue({});

      await service.respondToRequest(99, 2, false);

      expect(prisma.friendRequest.update).toHaveBeenCalledWith({
        where: { id: 99 },
        data: { status: FriendRequestStatus.DECLINED },
      });
      // Should NOT create friendship or send accepted push
      expect(prisma.friendship.create).not.toHaveBeenCalled();
      expect(notifications.sendFriendAcceptedPush).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when the sender tries to respond', async () => {
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 99,
        senderId: 5,
        receiverId: 2,
        status: FriendRequestStatus.PENDING,
        receiver: { displayName: 'Bob' },
      });

      // User 5 is the sender, not the receiver
      await expect(service.respondToRequest(99, 5, true)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.respondToRequest(99, 5, true)).rejects.toThrow(
        'You can only respond to your own requests',
      );
    });

    it('throws ForbiddenException when a random user tries to respond', async () => {
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 99,
        senderId: 5,
        receiverId: 2,
        status: FriendRequestStatus.PENDING,
        receiver: { displayName: 'Bob' },
      });

      // User 999 is neither sender nor receiver
      await expect(service.respondToRequest(99, 999, true)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('throws NotFoundException when request does not exist', async () => {
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.respondToRequest(999, 1, true)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when request was already responded to', async () => {
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 99,
        senderId: 5,
        receiverId: 2,
        status: FriendRequestStatus.DECLINED,
        receiver: { displayName: 'Bob' },
      });

      await expect(service.respondToRequest(99, 2, true)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.respondToRequest(99, 2, true)).rejects.toThrow(
        'This request has already been responded to',
      );
    });
  });

  // ── Full request lifecycle ────────────────────────────────────────

  describe('request lifecycle: send -> accept -> friends list', () => {
    it('shows both users in friends list after accepting', async () => {
      // Step 1: send request (already tested above, just verify integration)
      const requestCreatedAt = new Date('2026-04-01T10:00:00.000Z');
      (prisma.user.findUnique as jest.Mock)
        .mockResolvedValueOnce({ id: 2 }) // target
        .mockResolvedValueOnce({ displayName: 'Alice' }); // sender name
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.upsert as jest.Mock).mockResolvedValue({
        id: 1,
        createdAt: requestCreatedAt,
        sender: {
          id: 1,
          displayName: 'Alice',
          avatarUrl: null,
          subscriptionStatus: null,
          createdAt: new Date('2025-03-01T00:00:00.000Z'),
        },
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: BigInt(0) }]);

      await service.sendRequest('FRIEND-CODE', 1);

      // Step 2: accept request
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        senderId: 1,
        receiverId: 2,
        status: FriendRequestStatus.PENDING,
        receiver: { displayName: 'Bob' },
      });
      (prisma as any).$transaction = jest.fn().mockResolvedValue([]);

      await service.respondToRequest(1, 2, true);

      // Step 3: getFriends for user 1 should include user 2
      const now = new Date('2026-04-01T00:00:00.000Z');
      (prisma.friendship.findMany as jest.Mock).mockResolvedValue([
        {
          id: 10,
          userAId: 1,
          userBId: 2,
          createdAt: now,
          userA: {
            id: 1,
            displayName: 'Alice',
            avatarUrl: null,
            subscriptionStatus: null,
          },
          userB: {
            id: 2,
            displayName: 'Bob',
            avatarUrl: 'avatar.jpg',
            subscriptionStatus: null,
          },
        },
      ]);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: BigInt(0) }]);

      const friendsOfUser1 = await service.getFriends(1);

      expect(friendsOfUser1).toEqual([
        {
          friendshipId: 10,
          user: {
            id: 2,
            displayName: 'Bob',
            avatarUrl: null,
            isPro: false,
          },
          mutualFriendCount: 0,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ]);

      // Step 4: getFriends for user 2 should include user 1
      (prisma.friendship.findMany as jest.Mock).mockResolvedValue([
        {
          id: 10,
          userAId: 1,
          userBId: 2,
          createdAt: now,
          userA: { id: 1, displayName: 'Alice', avatarUrl: null },
          userB: { id: 2, displayName: 'Bob', avatarUrl: 'avatar.jpg' },
        },
      ]);

      const friendsOfUser2 = await service.getFriends(2);

      expect(friendsOfUser2).toEqual([
        {
          friendshipId: 10,
          user: {
            id: 1,
            displayName: 'Alice',
            avatarUrl: null,
            isPro: false,
          },
          mutualFriendCount: 0,
          createdAt: '2026-04-01T00:00:00.000Z',
        },
      ]);
    });
  });

  // ── unfriend ──────────────────────────────────────────────────────

  describe('unfriend', () => {
    it('deletes the friendship', async () => {
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue({
        id: 10,
        userAId: 1,
        userBId: 2,
      });
      (prisma.friendship.delete as jest.Mock).mockResolvedValue({});

      await service.unfriend(10, 1);

      expect(prisma.friendship.delete).toHaveBeenCalledWith({
        where: { id: 10 },
      });
    });

    it('allows userB to unfriend as well', async () => {
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue({
        id: 10,
        userAId: 1,
        userBId: 2,
      });
      (prisma.friendship.delete as jest.Mock).mockResolvedValue({});

      await service.unfriend(10, 2);

      expect(prisma.friendship.delete).toHaveBeenCalledWith({
        where: { id: 10 },
      });
    });

    it('throws NotFoundException when friendship does not exist', async () => {
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.unfriend(999, 1)).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when user is not part of friendship', async () => {
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue({
        id: 10,
        userAId: 1,
        userBId: 2,
      });

      await expect(service.unfriend(10, 99)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.unfriend(10, 99)).rejects.toThrow(
        'You are not part of this friendship',
      );
    });
  });

  // ── getUserProfile ────────────────────────────────────────────────

  describe('getUserProfile', () => {
    it('returns full profile with stats and friends list', async () => {
      const createdAt = new Date('2025-06-01T00:00:00.000Z');
      const friendshipCreatedAt = new Date('2026-01-15T00:00:00.000Z');

      // Target user lookup
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 2,
        displayName: 'Bob',
        avatarUrl: 'bob.jpg',
        friendCode: 'BOB-CODE-123',
        createdAt,
      });

      // Target's friendships
      (prisma.friendship.findMany as jest.Mock).mockResolvedValue([
        {
          id: 10,
          userAId: 2,
          userBId: 3,
          createdAt: friendshipCreatedAt,
          userA: { id: 2, displayName: 'Bob', avatarUrl: 'bob.jpg' },
          userB: { id: 3, displayName: 'Charlie', avatarUrl: 'charlie.jpg' },
        },
        {
          id: 11,
          userAId: 2,
          userBId: 4,
          createdAt: friendshipCreatedAt,
          userA: { id: 2, displayName: 'Bob', avatarUrl: 'bob.jpg' },
          userB: { id: 4, displayName: 'Diana', avatarUrl: null },
        },
      ]);

      // Stats: tripCount, cityCount
      (prisma.trip.count as jest.Mock).mockResolvedValue(5);
      (prisma.trip.findMany as jest.Mock).mockResolvedValue([{ cityId: 10 }]);

      // getRequestStatus: friends
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue({
        id: 99,
        userAId: 1,
        userBId: 2,
      });

      // Batch mutual counts and batch friend counts
      (prisma.$queryRaw as jest.Mock)
        .mockResolvedValueOnce([
          { user_id: 3, mutual_count: BigInt(2) },
          { user_id: 4, mutual_count: BigInt(1) },
        ])
        .mockResolvedValueOnce([
          { user_id: 3, friend_count: BigInt(8) },
          { user_id: 4, friend_count: BigInt(12) },
        ]);

      const result = await service.getUserProfile(2, 1);

      expect(result).toEqual({
        userId: 2,
        displayName: 'Bob',
        avatarUrl: null,
        friendCode: 'BOB-CODE-123',
        memberSince: '2025-06-01T00:00:00.000Z',
        tripCount: 5,
        cityCount: 1,
        friendCount: 2,
        requestStatus: 'friends',
        friendshipId: 99,
        friendRequestId: null,
        friends: [
          {
            userId: 3,
            displayName: 'Charlie',
            avatarUrl: null,
            friendCount: 8,
            mutualFriendCount: 2,
            isPro: false,
          },
          {
            userId: 4,
            displayName: 'Diana',
            avatarUrl: null,
            friendCount: 12,
            mutualFriendCount: 1,
            isPro: false,
          },
        ],
        isPro: false,
      });
    });

    it('throws NotFoundException when userId does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getUserProfile(999, 1)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns empty friends array when user has no friends', async () => {
      const createdAt = new Date('2025-06-01T00:00:00.000Z');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 2,
        displayName: 'Bob',
        avatarUrl: null,
        friendCode: 'BOB-CODE',
        createdAt,
      });

      // No friendships
      (prisma.friendship.findMany as jest.Mock).mockResolvedValue([]);

      // Stats
      (prisma.trip.count as jest.Mock).mockResolvedValue(0);
      (prisma.trip.findMany as jest.Mock).mockResolvedValue([]);

      // getRequestStatus: none
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.findUnique as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      const result = await service.getUserProfile(2, 1);

      expect(result.friends).toEqual([]);
      expect(result.friendCount).toBe(0);
      expect(result.requestStatus).toBe('none');
      expect(result.friendshipId).toBeNull();
      expect(result.friendRequestId).toBeNull();
    });

    it('includes friendRequestId when requestStatus is pending_sent', async () => {
      const createdAt = new Date('2025-06-01T00:00:00.000Z');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 2,
        displayName: 'Bob',
        avatarUrl: null,
        friendCode: 'BOB-CODE',
        createdAt,
      });
      (prisma.friendship.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.trip.count as jest.Mock).mockResolvedValue(0);
      (prisma.trip.findMany as jest.Mock).mockResolvedValue([]);

      // getRequestStatus: no friendship, sent request exists
      // findUnique on friendship is called twice (getRequestStatus + parallel findFriendship)
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue(null);
      // friendRequest.findUnique is called 4 times: 2 inside getRequestStatus
      // (sent, received), then 2 in the parallel block (sent, received).
      // With senderId=1, receiverId=2 → sent request found.
      (prisma.friendRequest.findUnique as jest.Mock).mockImplementation(
        ({ where }) => {
          const { senderId, receiverId } = where.senderId_receiverId;
          if (senderId === 1 && receiverId === 2) {
            return Promise.resolve({
              id: 77,
              senderId: 1,
              receiverId: 2,
              status: FriendRequestStatus.PENDING,
            });
          }
          return Promise.resolve(null);
        },
      );

      const result = await service.getUserProfile(2, 1);

      expect(result.requestStatus).toBe('pending_sent');
      expect(result.friendRequestId).toBe(77);
      expect(result.friendshipId).toBeNull();
    });

    it('includes friendRequestId when requestStatus is pending_received', async () => {
      const createdAt = new Date('2025-06-01T00:00:00.000Z');

      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 2,
        displayName: 'Bob',
        avatarUrl: null,
        friendCode: 'BOB-CODE',
        createdAt,
      });
      (prisma.friendship.findMany as jest.Mock).mockResolvedValue([]);
      (prisma.trip.count as jest.Mock).mockResolvedValue(0);
      (prisma.trip.findMany as jest.Mock).mockResolvedValue([]);

      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue(null);
      // senderId=2, receiverId=1 → received request found.
      (prisma.friendRequest.findUnique as jest.Mock).mockImplementation(
        ({ where }) => {
          const { senderId, receiverId } = where.senderId_receiverId;
          if (senderId === 2 && receiverId === 1) {
            return Promise.resolve({
              id: 88,
              senderId: 2,
              receiverId: 1,
              status: FriendRequestStatus.PENDING,
            });
          }
          return Promise.resolve(null);
        },
      );

      const result = await service.getUserProfile(2, 1);

      expect(result.requestStatus).toBe('pending_received');
      expect(result.friendRequestId).toBe(88);
      expect(result.friendshipId).toBeNull();
    });
  });

  // ── getPendingRequests ────────────────────────────────────────────

  describe('getPendingRequests', () => {
    it('returns pending requests with mutual friend count', async () => {
      const createdAt = new Date('2026-04-01T10:00:00.000Z');
      (prisma.friendRequest.findMany as jest.Mock).mockResolvedValue([
        {
          id: 1,
          senderId: 5,
          receiverId: 2,
          status: FriendRequestStatus.PENDING,
          createdAt,
          sender: {
            id: 5,
            displayName: 'Eve',
            avatarUrl: 'eve.jpg',
            createdAt: new Date('2024-11-05T00:00:00.000Z'),
          },
        },
      ]);
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: BigInt(3) }]);

      const result = await service.getPendingRequests(2);

      expect(result).toEqual([
        {
          id: 1,
          sender: {
            id: 5,
            displayName: 'Eve',
            avatarUrl: null,
            isPro: false,
            memberSince: '2024-11-05T00:00:00.000Z',
          },
          mutualFriendCount: 3,
          createdAt: '2026-04-01T10:00:00.000Z',
        },
      ]);
    });
  });

  // ── previewFriend ─────────────────────────────────────────────────

  describe('previewFriend', () => {
    it('returns preview with requestStatus "none" when no relationship', async () => {
      const createdAt = new Date('2025-01-01T00:00:00.000Z');
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 2,
        displayName: 'Bob',
        avatarUrl: 'bob.jpg',
        createdAt,
      });
      (prisma.trip.count as jest.Mock).mockResolvedValue(5);
      (prisma.trip.findMany as jest.Mock)
        .mockResolvedValueOnce([{ countryId: 1 }, { countryId: 2 }]) // countries
        .mockResolvedValueOnce([{ cityId: 10 }]); // cities
      // getRequestStatus: no friendship, no pending requests
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // sent request
        .mockResolvedValueOnce(null); // received request
      // mutual friend count
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: BigInt(1) }]);

      const result = await service.previewFriend('BOB-CODE', 1);

      expect(result).toEqual({
        userId: 2,
        displayName: 'Bob',
        avatarUrl: null,
        memberSince: '2025-01-01T00:00:00.000Z',
        mutualFriendCount: 1,
        tripCount: 5,
        countryCount: 2,
        cityCount: 1,
        requestStatus: 'none',
      });
    });

    it('returns requestStatus "friends" when already friends', async () => {
      const createdAt = new Date('2025-01-01T00:00:00.000Z');
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 2,
        displayName: 'Bob',
        avatarUrl: null,
        createdAt,
      });
      (prisma.trip.count as jest.Mock).mockResolvedValue(0);
      (prisma.trip.findMany as jest.Mock).mockResolvedValue([]); // countries and cities
      // getRequestStatus: friendship exists
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue({
        id: 10,
        userAId: 1,
        userBId: 2,
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: BigInt(0) }]);

      const result = await service.previewFriend('BOB-CODE', 1);

      expect(result.requestStatus).toBe('friends');
    });

    it('returns requestStatus "pending_sent" when current user sent request', async () => {
      const createdAt = new Date('2025-01-01T00:00:00.000Z');
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 2,
        displayName: 'Bob',
        avatarUrl: null,
        createdAt,
      });
      (prisma.trip.count as jest.Mock).mockResolvedValue(0);
      (prisma.trip.findMany as jest.Mock).mockResolvedValue([]);
      // getRequestStatus: no friendship, sent request exists
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.findUnique as jest.Mock).mockResolvedValueOnce({
        id: 5,
        senderId: 1,
        receiverId: 2,
        status: FriendRequestStatus.PENDING,
      });
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: BigInt(0) }]);

      const result = await service.previewFriend('BOB-CODE', 1);

      expect(result.requestStatus).toBe('pending_sent');
    });

    it('returns requestStatus "pending_received" when target user sent request', async () => {
      const createdAt = new Date('2025-01-01T00:00:00.000Z');
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 2,
        displayName: 'Bob',
        avatarUrl: null,
        createdAt,
      });
      (prisma.trip.count as jest.Mock).mockResolvedValue(0);
      (prisma.trip.findMany as jest.Mock).mockResolvedValue([]);
      // getRequestStatus: no friendship, no sent request, received request exists
      (prisma.friendship.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.friendRequest.findUnique as jest.Mock)
        .mockResolvedValueOnce(null) // sent request (none)
        .mockResolvedValueOnce({
          id: 6,
          senderId: 2,
          receiverId: 1,
          status: FriendRequestStatus.PENDING,
        }); // received request
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ count: BigInt(0) }]);

      const result = await service.previewFriend('BOB-CODE', 1);

      expect(result.requestStatus).toBe('pending_received');
    });

    it('throws NotFoundException when friend code does not exist', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.previewFriend('NONEXISTENT', 1)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── getPublicPreviewByCode ────────────────────────────────────────
  // Anti-leak guard: the response shape must remain a strict subset of
  // PublicFriendPreviewDto. If you add a field here, audit whether it
  // exposes anything that depends on caller identity (mutual count,
  // request status) or internal IDs.

  describe('getPublicPreviewByCode', () => {
    it('returns exactly { displayName, tripCount } and nothing else', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue({
        id: 7,
        displayName: 'Carol',
      });
      (prisma.trip.count as jest.Mock).mockResolvedValue(3);

      const result = await service.getPublicPreviewByCode('CAROL-CODE');

      expect(Object.keys(result).sort()).toEqual(
        ['displayName', 'tripCount'].sort(),
      );
      expect(result).toEqual({
        displayName: 'Carol',
        tripCount: 3,
      });
    });

    it('throws NotFoundException for an unknown friend code', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(service.getPublicPreviewByCode('NOPE')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
