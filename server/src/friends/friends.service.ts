import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FriendRequestStatus,
  InviteStatus,
  Prisma,
  TripStatus,
  SubscriptionStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FriendsHandler } from '../realtime/handlers/friends.handler';
import { StorageService } from '../storage/storage.service';
import { FriendPreviewDto } from './dto/friend-preview.dto';
import { FriendProfileDto } from './dto/friend-profile.dto';
import { FriendRequestDto } from './dto/friend-request.dto';
import { FriendDto } from './dto/friend.dto';
import { PublicFriendPreviewDto } from './dto/public-friend-preview.dto';
import { isEntitledToPro } from '../common/subscription-status.util';

@Injectable()
export class FriendsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
    private readonly friendsHandler: FriendsHandler,
    private readonly storageService: StorageService,
  ) {}

  private async resolveAvatarUrl(value: string | null): Promise<string | null> {
    if (!value) return null;
    if (/^https?:\/\//i.test(value)) return value;
    try {
      const { url } = await this.storageService.getSignedThumbUrl(value);
      return url;
    } catch {
      return null;
    }
  }

  async previewFriend(
    friendCode: string,
    currentUserId: number,
  ): Promise<FriendPreviewDto> {
    const targetUser = await this.prisma.user.findUnique({
      where: { friendCode },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        createdAt: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const [
      tripCount,
      countryCount,
      cityCount,
      requestStatus,
      mutualFriendCount,
    ] = await Promise.all([
      this.getTripCount(targetUser.id),
      this.getCountryCount(targetUser.id),
      this.getCityCount(targetUser.id),
      this.getRequestStatus(currentUserId, targetUser.id),
      this.getMutualFriendCount(currentUserId, targetUser.id),
    ]);

    return {
      userId: targetUser.id,
      displayName: targetUser.displayName,
      avatarUrl: await this.resolveAvatarUrl(targetUser.avatarUrl),
      memberSince: targetUser.createdAt.toISOString(),
      mutualFriendCount,
      tripCount,
      countryCount,
      cityCount,
      requestStatus,
    };
  }

  // Public, no-auth friend preview consumed by the share-link landing page
  // (server/src/deeplinks/deeplinks.controller.ts). Strict whitelist — must
  // never leak fields that depend on the caller's identity (mutualFriendCount,
  // requestStatus) or internal IDs.
  async getPublicPreviewByCode(
    friendCode: string,
  ): Promise<PublicFriendPreviewDto> {
    const targetUser = await this.prisma.user.findUnique({
      where: { friendCode },
      select: {
        id: true,
        displayName: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const tripCount = await this.getTripCount(targetUser.id);

    return {
      displayName: targetUser.displayName,
      tripCount,
    };
  }

  async sendRequest(friendCode: string, senderId: number): Promise<void> {
    const targetUser = await this.prisma.user.findUnique({
      where: { friendCode },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    if (targetUser.id === senderId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    // Check if already friends
    const existingFriendship = await this.findFriendship(
      senderId,
      targetUser.id,
    );
    if (existingFriendship) {
      throw new BadRequestException('You are already friends with this user');
    }

    // Check for existing pending request in either direction
    const existingRequest = await this.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId, receiverId: targetUser.id },
          { senderId: targetUser.id, receiverId: senderId },
        ],
        status: FriendRequestStatus.PENDING,
      },
    });

    if (existingRequest) {
      throw new BadRequestException('A friend request already exists');
    }

    // Upsert to handle re-sending after a decline.
    // Under concurrent sends, Prisma can still throw P2002 on the unique key.
    // Map that race to a stable 400 response instead of a 500.
    let request: {
      id: number;
      createdAt: Date;
      sender: {
        id: number;
        displayName: string;
        avatarUrl: string | null;
        subscriptionStatus: SubscriptionStatus;
        subscriptionExpiresAt: Date | null;
        createdAt: Date;
      };
    };

    try {
      request = await this.prisma.friendRequest.upsert({
        where: {
          senderId_receiverId: { senderId, receiverId: targetUser.id },
        },
        create: {
          senderId,
          receiverId: targetUser.id,
          status: FriendRequestStatus.PENDING,
        },
        update: {
          status: FriendRequestStatus.PENDING,
        },
        include: {
          sender: {
            select: {
              id: true,
              displayName: true,
              avatarUrl: true,
              subscriptionStatus: true,
              subscriptionExpiresAt: true,
              createdAt: true,
            },
          },
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new BadRequestException('A friend request already exists');
      }
      throw error;
    }

    const senderDisplayName = request.sender.displayName;

    // Build the DTO to send via WebSocket
    const requestDto: FriendRequestDto = {
      id: request.id,
      sender: {
        id: request.sender.id,
        displayName: request.sender.displayName,
        avatarUrl: await this.resolveAvatarUrl(request.sender.avatarUrl),
        isPro: isEntitledToPro(request.sender),
        memberSince: request.sender.createdAt.toISOString(),
      },
      mutualFriendCount: await this.getMutualFriendCount(
        senderId,
        targetUser.id,
      ),
      createdAt: request.createdAt.toISOString(),
    };

    // Real-time delivery via WebSocket
    this.friendsHandler.sendFriendRequest(targetUser.id, requestDto);

    this.notificationsService.sendFriendRequestPush(
      targetUser.id,
      senderDisplayName,
    );
  }

  async getPendingRequests(userId: number): Promise<FriendRequestDto[]> {
    const requests = await this.prisma.friendRequest.findMany({
      where: {
        receiverId: userId,
        status: FriendRequestStatus.PENDING,
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            subscriptionStatus: true,
            subscriptionExpiresAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      requests.map(async (req) => ({
        id: req.id,
        sender: {
          id: req.sender.id,
          displayName: req.sender.displayName,
          avatarUrl: await this.resolveAvatarUrl(req.sender.avatarUrl),
          isPro: isEntitledToPro(req.sender),
          memberSince: req.sender.createdAt.toISOString(),
        },
        mutualFriendCount: await this.getMutualFriendCount(
          userId,
          req.senderId,
        ),
        createdAt: req.createdAt.toISOString(),
      })),
    );
  }

  async respondToRequest(
    requestId: number,
    userId: number,
    accept: boolean,
  ): Promise<void> {
    const request = await this.prisma.friendRequest.findUnique({
      where: { id: requestId },
      include: {
        receiver: { select: { displayName: true } },
      },
    });

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.receiverId !== userId) {
      throw new ForbiddenException('You can only respond to your own requests');
    }

    if (request.status !== FriendRequestStatus.PENDING) {
      throw new BadRequestException(
        'This request has already been responded to',
      );
    }

    if (accept) {
      const [userAId, userBId] = this.canonicalOrder(
        request.senderId,
        request.receiverId,
      );

      await this.prisma.$transaction([
        this.prisma.friendRequest.delete({ where: { id: requestId } }),
        this.prisma.friendship.create({
          data: { userAId, userBId },
        }),
      ]);

      this.friendsHandler.sendFriendRequestAccepted(request.senderId, {
        acceptedBy: request.receiver.displayName,
      });

      this.notificationsService.sendFriendAcceptedPush(
        request.senderId,
        request.receiver.displayName,
      );
    } else {
      await this.prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: FriendRequestStatus.DECLINED },
      });
    }
  }

  async cancelSentRequest(friendCode: string, senderId: number): Promise<void> {
    const targetUser = await this.prisma.user.findUnique({
      where: { friendCode },
      select: { id: true },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const request = await this.prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: {
          senderId,
          receiverId: targetUser.id,
        },
      },
    });

    if (!request || request.status !== FriendRequestStatus.PENDING) {
      throw new NotFoundException('Pending friend request not found');
    }

    if (request.senderId !== senderId) {
      throw new ForbiddenException(
        'You can only cancel your own sent requests',
      );
    }

    await this.prisma.friendRequest.delete({
      where: { id: request.id },
    });
  }

  async getFriends(userId: number): Promise<FriendDto[]> {
    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      include: {
        userA: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            subscriptionStatus: true,
            subscriptionExpiresAt: true,
          },
        },
        userB: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            subscriptionStatus: true,
            subscriptionExpiresAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return Promise.all(
      friendships.map(async (f) => {
        const friend = f.userAId === userId ? f.userB : f.userA;
        return {
          friendshipId: f.id,
          user: {
            id: friend.id,
            displayName: friend.displayName,
            avatarUrl: await this.resolveAvatarUrl(friend.avatarUrl),
            isPro: isEntitledToPro(friend),
          },
          mutualFriendCount: await this.getMutualFriendCount(userId, friend.id),
          createdAt: f.createdAt.toISOString(),
        };
      }),
    );
  }

  async getUserProfile(
    targetUserId: number,
    currentUserId: number,
  ): Promise<FriendProfileDto> {
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        displayName: true,
        avatarUrl: true,
        friendCode: true,
        createdAt: true,
        subscriptionStatus: true,
        subscriptionExpiresAt: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundException('User not found');
    }

    const friendships = await this.prisma.friendship.findMany({
      where: {
        OR: [{ userAId: targetUserId }, { userBId: targetUserId }],
      },
      include: {
        userA: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            subscriptionStatus: true,
            subscriptionExpiresAt: true,
          },
        },
        userB: {
          select: {
            id: true,
            displayName: true,
            avatarUrl: true,
            subscriptionStatus: true,
            subscriptionExpiresAt: true,
            createdAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const friendUsers = friendships.map((f) =>
      f.userAId === targetUserId ? f.userB : f.userA,
    );
    const friendIds = friendUsers.map((u) => u.id);

    const [
      tripCount,
      cityCount,
      requestStatus,
      mutualCounts,
      friendCounts,
      profileFriendship,
      sentRequest,
      receivedRequest,
    ] = await Promise.all([
      this.getTripCount(targetUserId),
      this.getCityCount(targetUserId),
      this.getRequestStatus(currentUserId, targetUserId),
      this.getBatchMutualFriendCounts(currentUserId, friendIds),
      this.getBatchFriendCounts(friendIds),
      this.findFriendship(currentUserId, targetUserId),
      this.prisma.friendRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId: currentUserId,
            receiverId: targetUserId,
          },
        },
      }),
      this.prisma.friendRequest.findUnique({
        where: {
          senderId_receiverId: {
            senderId: targetUserId,
            receiverId: currentUserId,
          },
        },
      }),
    ]);

    let friendshipId: number | null = null;
    let friendRequestId: number | null = null;
    if (requestStatus === 'friends') {
      friendshipId = profileFriendship?.id ?? null;
    } else if (requestStatus === 'pending_sent') {
      friendRequestId = sentRequest?.id ?? null;
    } else if (requestStatus === 'pending_received') {
      friendRequestId = receivedRequest?.id ?? null;
    }

    const [resolvedTargetAvatar, resolvedFriendAvatars] = await Promise.all([
      this.resolveAvatarUrl(targetUser.avatarUrl),
      Promise.all(friendUsers.map((u) => this.resolveAvatarUrl(u.avatarUrl))),
    ]);

    return {
      userId: targetUser.id,
      displayName: targetUser.displayName,
      avatarUrl: resolvedTargetAvatar,
      friendCode: targetUser.friendCode,
      memberSince: targetUser.createdAt.toISOString(),
      isPro: isEntitledToPro(targetUser),
      tripCount,
      cityCount,
      friendCount: friendships.length,
      requestStatus,
      friendshipId,
      friendRequestId,
      friends: friendUsers.map((u, index) => ({
        userId: u.id,
        displayName: u.displayName,
        avatarUrl: resolvedFriendAvatars[index],
        friendCount: friendCounts.get(u.id) ?? 0,
        mutualFriendCount: mutualCounts.get(u.id) ?? 0,
        isPro: isEntitledToPro(u),
      })),
    };
  }

  async unfriend(friendshipId: number, userId: number): Promise<void> {
    const friendship = await this.prisma.friendship.findUnique({
      where: { id: friendshipId },
    });

    if (!friendship) {
      throw new NotFoundException('Friendship not found');
    }

    if (friendship.userAId !== userId && friendship.userBId !== userId) {
      throw new ForbiddenException('You are not part of this friendship');
    }

    await this.prisma.friendship.delete({ where: { id: friendshipId } });
  }

  // ── Private helpers ──────────────────────────────────────────────

  private canonicalOrder(a: number, b: number): [number, number] {
    return a < b ? [a, b] : [b, a];
  }

  private async findFriendship(userIdA: number, userIdB: number) {
    const [a, b] = this.canonicalOrder(userIdA, userIdB);
    return this.prisma.friendship.findUnique({
      where: { userAId_userBId: { userAId: a, userBId: b } },
    });
  }

  private async getMutualFriendCount(
    userIdA: number,
    userIdB: number,
  ): Promise<number> {
    const result = await this.prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM (
        SELECT CASE WHEN user_a_id = ${userIdA} THEN user_b_id ELSE user_a_id END AS friend_id
        FROM friendship
        WHERE user_a_id = ${userIdA} OR user_b_id = ${userIdA}
      ) AS friends_a
      INNER JOIN (
        SELECT CASE WHEN user_a_id = ${userIdB} THEN user_b_id ELSE user_a_id END AS friend_id
        FROM friendship
        WHERE user_a_id = ${userIdB} OR user_b_id = ${userIdB}
      ) AS friends_b
      ON friends_a.friend_id = friends_b.friend_id
    `;
    return Number(result[0].count);
  }

  private async getTripCount(userId: number): Promise<number> {
    return this.prisma.trip.count({
      where: {
        status: TripStatus.ENDED,
        members: {
          some: { userId, inviteStatus: InviteStatus.ACCEPTED },
        },
      },
    });
  }

  private async getCountryCount(userId: number): Promise<number> {
    const trips = await this.prisma.trip.findMany({
      where: {
        status: TripStatus.ENDED,
        members: {
          some: { userId, inviteStatus: InviteStatus.ACCEPTED },
        },
        countryId: { not: null },
      },
      select: { countryId: true },
      distinct: ['countryId'],
    });
    return trips.length;
  }

  private async getCityCount(userId: number): Promise<number> {
    const trips = await this.prisma.trip.findMany({
      where: {
        status: TripStatus.ENDED,
        members: {
          some: { userId, inviteStatus: InviteStatus.ACCEPTED },
        },
        cityId: { not: null },
      },
      select: { cityId: true },
      distinct: ['cityId'],
    });
    return trips.length;
  }

  private async getBatchMutualFriendCounts(
    currentUserId: number,
    friendIds: number[],
  ): Promise<Map<number, number>> {
    if (friendIds.length === 0) return new Map();

    const result = await this.prisma.$queryRaw<
      { user_id: number; mutual_count: bigint }[]
    >`
      SELECT
        targets.user_id,
        COUNT(f_current.friend_id) AS mutual_count
      FROM (
        SELECT unnest(${friendIds}::int[]) AS user_id
      ) AS targets
      CROSS JOIN LATERAL (
        SELECT CASE WHEN user_a_id = targets.user_id THEN user_b_id ELSE user_a_id END AS friend_id
        FROM friendship
        WHERE user_a_id = targets.user_id OR user_b_id = targets.user_id
      ) AS f_targets
      INNER JOIN (
        SELECT CASE WHEN user_a_id = ${currentUserId} THEN user_b_id ELSE user_a_id END AS friend_id
        FROM friendship
        WHERE user_a_id = ${currentUserId} OR user_b_id = ${currentUserId}
      ) AS f_current ON f_targets.friend_id = f_current.friend_id
      GROUP BY targets.user_id
    `;

    const map = new Map<number, number>();
    for (const row of result) {
      map.set(Number(row.user_id), Number(row.mutual_count));
    }
    return map;
  }

  private async getBatchFriendCounts(
    userIds: number[],
  ): Promise<Map<number, number>> {
    if (userIds.length === 0) return new Map();

    const result = await this.prisma.$queryRaw<
      { user_id: number; friend_count: bigint }[]
    >`
      SELECT
        u.id AS user_id,
        COUNT(f.id) AS friend_count
      FROM unnest(${userIds}::int[]) AS u(id)
      LEFT JOIN friendship f ON f.user_a_id = u.id OR f.user_b_id = u.id
      GROUP BY u.id
    `;

    const map = new Map<number, number>();
    for (const row of result) {
      map.set(Number(row.user_id), Number(row.friend_count));
    }
    return map;
  }

  private async getRequestStatus(
    currentUserId: number,
    targetUserId: number,
  ): Promise<'none' | 'pending_sent' | 'pending_received' | 'friends'> {
    // Check if already friends
    const friendship = await this.findFriendship(currentUserId, targetUserId);
    if (friendship) return 'friends';

    // Check for pending request from current user
    const sentRequest = await this.prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: {
          senderId: currentUserId,
          receiverId: targetUserId,
        },
      },
    });
    if (sentRequest?.status === FriendRequestStatus.PENDING)
      return 'pending_sent';

    // Check for pending request to current user
    const receivedRequest = await this.prisma.friendRequest.findUnique({
      where: {
        senderId_receiverId: {
          senderId: targetUserId,
          receiverId: currentUserId,
        },
      },
    });
    if (receivedRequest?.status === FriendRequestStatus.PENDING)
      return 'pending_received';

    return 'none';
  }
}
