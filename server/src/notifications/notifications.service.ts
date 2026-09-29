import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { EngagementLocale, InviteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ApnsPushAdapter } from './adapters/apns-push.adapter';
import { FcmPushAdapter } from './adapters/fcm-push.adapter';
import {
  LogicalPushPayload,
  PushPayloadBuilder,
} from './adapters/push-payload';
import {
  AdminPushAudience,
  AdminPushDestination,
  SendAdminPushDto,
} from './dto/send-admin-push.dto';
import { AdminPushResultDto } from './dto/admin-push-result.dto';
import {
  MISSION_PUSH_NAMES,
  PUSH_COPY,
  pushLocale,
} from './notifications.copy';
import type { MissionId } from '../missions/mission-defs';

/** A device token paired with its owning user's locale, for locale grouping. */
type LocaleTokenRow = {
  token: string;
  platform: string;
  user: { locale: EngagementLocale };
};

/** Prisma select that pairs every token with the owner's locale. */
const TOKEN_WITH_LOCALE = {
  token: true,
  platform: true,
  user: { select: { locale: true } },
} as const;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly apns: ApnsPushAdapter,
    private readonly fcm: FcmPushAdapter,
  ) {}

  async registerToken(
    userId: number,
    token: string,
    platform: string = 'ios',
    locale?: EngagementLocale,
  ): Promise<void> {
    await this.prisma.deviceToken.upsert({
      where: { token },
      update: { userId, platform },
      create: { userId, token, platform },
    });
    // Capture the device language onto the user so engagement copy can be
    // localized even for users who never open Settings.
    if (locale) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { locale },
      });
    }
  }

  async unregisterToken(userId: number, token: string): Promise<void> {
    await this.prisma.deviceToken.deleteMany({ where: { userId, token } });
  }

  async sendFriendRequestPush(
    receiverUserId: number,
    senderDisplayName: string,
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: receiverUserId },
      select: TOKEN_WITH_LOCALE,
    });
    await this.dispatchLocalized(tokens, (locale) => ({
      ...PushPayloadBuilder.friendRequest({ senderDisplayName }),
      ...PUSH_COPY.friendRequest[locale](senderDisplayName),
    }));
  }

  async sendFriendAcceptedPush(
    senderUserId: number,
    accepterDisplayName: string,
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: senderUserId },
      select: TOKEN_WITH_LOCALE,
    });
    await this.dispatchLocalized(tokens, (locale) => ({
      ...PushPayloadBuilder.friendAccepted({ accepterDisplayName }),
      ...PUSH_COPY.friendAccepted[locale](accepterDisplayName),
    }));
  }

  async sendTripRequestFulfilledPush(
    requesterUserId: number,
    destinationName: string,
    listingId: number,
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: requesterUserId },
      select: TOKEN_WITH_LOCALE,
    });
    await this.dispatchLocalized(tokens, (locale) => ({
      ...PushPayloadBuilder.tripRequestFulfilled({
        destinationName,
        listingId,
      }),
      ...PUSH_COPY.tripRequestFulfilled[locale](destinationName),
    }));
  }

  async sendTripInvitePush(
    inviteeUserId: number,
    inviterDisplayName: string,
    tripName: string,
    inviteCode: string,
    onlineUserIds: number[],
  ): Promise<void> {
    if (onlineUserIds.includes(inviteeUserId)) return;
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: inviteeUserId },
      select: TOKEN_WITH_LOCALE,
    });
    await this.dispatchLocalized(tokens, (locale) => ({
      ...PushPayloadBuilder.tripInvite({
        inviterDisplayName,
        tripName,
        inviteCode,
      }),
      ...PUSH_COPY.tripInvite[locale](inviterDisplayName, tripName),
    }));
  }

  async sendChatPush(
    tripId: number,
    senderId: number,
    senderName: string,
    content: string,
    onlineUserIds: number[],
  ): Promise<void> {
    const excludeUserIds = [senderId, ...onlineUserIds];
    const [trip, tokens] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { name: true },
      }),
      this.prisma.deviceToken.findMany({
        where: {
          user: {
            tripMembers: {
              some: { tripId, inviteStatus: InviteStatus.ACCEPTED },
            },
          },
          userId: { notIn: excludeUserIds },
        },
        select: TOKEN_WITH_LOCALE,
      }),
    ]);
    // Chat title/body are the trip name and the message itself — never
    // translated. Only the missing-trip-name fallback is localized.
    await this.dispatchLocalized(tokens, (locale) =>
      PushPayloadBuilder.chat({
        tripId,
        tripName: trip?.name ?? PUSH_COPY.chatFallbackTitle[locale](),
        senderName,
        content,
      }),
    );
  }

  async sendMemberLeftPush(
    tripId: number,
    leavingUserId: number,
    leavingUserName: string,
  ): Promise<void> {
    const [trip, tokens] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { name: true },
      }),
      this.prisma.deviceToken.findMany({
        where: {
          user: {
            tripMembers: {
              some: { tripId, inviteStatus: InviteStatus.ACCEPTED },
            },
          },
          userId: { not: leavingUserId },
        },
        select: TOKEN_WITH_LOCALE,
      }),
    ]);
    await this.dispatchLocalized(tokens, (locale) => {
      const tripName = trip?.name ?? PUSH_COPY.tripFallbackTitle[locale]();
      return {
        ...PushPayloadBuilder.memberLeft({
          tripId,
          tripName,
          leavingUserName,
        }),
        ...PUSH_COPY.memberLeft[locale](tripName, leavingUserName),
      };
    });
  }

  /** Host-only: a vault member announced leave and needs confirm. */
  async sendVaultLeaveAnnouncedPush(
    hostUserId: number,
    tripId: number,
    leavingUserName: string,
  ): Promise<void> {
    const [trip, tokens] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { name: true },
      }),
      this.prisma.deviceToken.findMany({
        where: { userId: hostUserId },
        select: TOKEN_WITH_LOCALE,
      }),
    ]);
    await this.dispatchLocalized(tokens, (locale) => {
      const tripName = trip?.name ?? PUSH_COPY.tripFallbackTitle[locale]();
      return {
        ...PushPayloadBuilder.vaultLeaveAnnounced({
          tripId,
          tripName,
          leavingUserName,
        }),
        ...PUSH_COPY.vaultLeaveAnnounced[locale](tripName, leavingUserName),
      };
    });
  }

  async sendMemberJoinedPush(
    tripId: number,
    joiningUserId: number,
    joiningUserName: string,
  ): Promise<void> {
    const [trip, tokens] = await Promise.all([
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { name: true },
      }),
      this.prisma.deviceToken.findMany({
        where: {
          user: {
            tripMembers: {
              some: { tripId, inviteStatus: InviteStatus.ACCEPTED },
            },
          },
          userId: { not: joiningUserId },
        },
        select: TOKEN_WITH_LOCALE,
      }),
    ]);
    await this.dispatchLocalized(tokens, (locale) => {
      const tripName = trip?.name ?? PUSH_COPY.tripFallbackTitle[locale]();
      return {
        ...PushPayloadBuilder.memberJoined({
          tripId,
          tripName,
          joiningUserName,
        }),
        ...PUSH_COPY.memberJoined[locale](tripName, joiningUserName),
      };
    });
  }

  // Cron auto-start: every accepted member gets told the trip is live.
  async sendTripStartedPush(
    tripId: number,
    tripName: string,
    memberUserIds: number[],
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: { in: memberUserIds } },
      select: TOKEN_WITH_LOCALE,
    });
    await this.dispatchLocalized(tokens, (locale) => ({
      ...PushPayloadBuilder.tripStarted({ tripId, tripName }),
      ...PUSH_COPY.tripStarted[locale](tripName),
    }));
  }

  // Cron auto-start refused because a member is on another ongoing trip —
  // only the creator can resolve it, so only they are told.
  async sendTripAutoStartBlockedPush(
    creatorUserId: number,
    tripId: number,
    tripName: string,
    memberNames: string[],
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: creatorUserId },
      select: TOKEN_WITH_LOCALE,
    });
    await this.dispatchLocalized(tokens, (locale) => ({
      ...PushPayloadBuilder.tripAutoStartBlocked({
        tripId,
        tripName,
        memberNames,
      }),
      ...PUSH_COPY.tripAutoStartBlocked[locale](tripName, memberNames),
    }));
  }

  async sendPlanReminderPush(
    planItem: {
      id: number;
      title: string;
      startTime: string;
      location: string | null;
    },
    tripId: number,
    tripName: string,
    memberUserIds: number[],
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: { in: memberUserIds } },
      select: TOKEN_WITH_LOCALE,
    });
    await this.dispatchLocalized(tokens, (locale) => ({
      ...PushPayloadBuilder.planReminder({ tripId, tripName, planItem }),
      ...PUSH_COPY.planReminder[locale](
        tripName,
        planItem.title,
        planItem.startTime,
        planItem.location,
      ),
    }));
  }

  async sendListingStatusPush(
    ownerUserId: number,
    listingName: string,
    approved: boolean,
    listingId: number,
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId: ownerUserId },
      select: TOKEN_WITH_LOCALE,
    });
    await this.dispatchLocalized(tokens, (locale) => ({
      ...PushPayloadBuilder.listingStatus({ listingId, listingName, approved }),
      ...PUSH_COPY.listingStatus[locale](listingName, approved),
    }));
  }

  // Fires post-commit from MissionsService.award on every real mission
  // completion (never on idempotent replays or cap hits).
  async sendMissionCompletedPush(
    userId: number,
    missionId: MissionId,
    rewardAmount: number,
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: TOKEN_WITH_LOCALE,
    });
    await this.dispatchLocalized(tokens, (locale) => ({
      ...PushPayloadBuilder.missionCompleted({ missionId, rewardAmount }),
      ...PUSH_COPY.missionCompleted[locale](
        MISSION_PUSH_NAMES[missionId][locale],
        rewardAmount,
      ),
    }));
  }

  // Fires when a background pin extraction reaches a terminal state. The
  // caller decides whether to skip this (e.g. when a live SSE subscriber
  // is still attached — they'll see the `done` event directly).
  async sendPinExtractionCompletedPush(
    userId: number,
    sessionId: string,
    summary: {
      status: 'DONE' | 'FAILED';
      pinCount: number;
      videoTitle?: string;
    },
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: TOKEN_WITH_LOCALE,
    });
    await this.dispatchLocalized(tokens, (locale) => ({
      ...PushPayloadBuilder.pinExtractionCompleted({ sessionId, ...summary }),
      ...(summary.status === 'DONE'
        ? PUSH_COPY.pinExtractionDone[locale](
            summary.pinCount,
            summary.videoTitle,
          )
        : PUSH_COPY.pinExtractionFailed[locale]()),
    }));
  }

  // Localized fan-out: group tokens by the owning user's locale, build one
  // payload per locale group (only title/body differ), and send each group
  // through the platform adapters.
  private async dispatchLocalized(
    rows: LocaleTokenRow[],
    build: (locale: EngagementLocale) => LogicalPushPayload,
  ): Promise<void> {
    if (rows.length === 0) return;

    const byLocale = new Map<EngagementLocale, LocaleTokenRow[]>();
    for (const row of rows) {
      const locale = pushLocale(row.user.locale);
      const bucket = byLocale.get(locale);
      if (bucket) bucket.push(row);
      else byLocale.set(locale, [row]);
    }

    for (const [locale, groupRows] of byLocale) {
      await this.dispatchAndCleanup(groupRows, build(locale));
    }
  }

  private async dispatchAndCleanup(
    tokens: { token: string; platform: string }[],
    payload: LogicalPushPayload,
  ): Promise<void> {
    if (tokens.length === 0) return;
    const iosTokens = tokens
      .filter((t) => t.platform === 'ios')
      .map((t) => t.token);
    const androidTokens = tokens
      .filter((t) => t.platform === 'android')
      .map((t) => t.token);
    const [apnsResult, fcmResult] = await Promise.all([
      this.apns.sendBatch(iosTokens, payload),
      this.fcm.sendBatch(androidTokens, payload),
    ]);
    const invalid = [...apnsResult.invalidTokens, ...fcmResult.invalidTokens];
    if (invalid.length > 0) {
      await this.prisma.deviceToken.deleteMany({
        where: { token: { in: invalid } },
      });
      this.logger.log(`Removed ${invalid.length} invalid token(s)`);
    }
  }

  async getDeviceTokenCounts(): Promise<{
    ios: number;
    android: number;
    total: number;
  }> {
    const rows = await this.prisma.deviceToken.groupBy({
      by: ['platform'],
      _count: { _all: true },
    });
    const ios = rows.find((r) => r.platform === 'ios')?._count._all ?? 0;
    const android =
      rows.find((r) => r.platform === 'android')?._count._all ?? 0;
    return { ios, android, total: ios + android };
  }

  // Engagement / marketing push (daily nudges). `deepLink.type` routes the tap
  // on iOS (engagement_unfinished_plan / engagement_weather / engagement_dormant
  // / engagement_new_plan). Marketing pushes: pushType='alert' + priority=5
  // (non-urgent/throttle-able) and NO badge mutation, so they never clobber a
  // user's real unread count.
  async sendEngagementPush(
    userId: number,
    title: string,
    body: string,
    deepLink: { type: string; tripId?: number; listingId?: number },
  ): Promise<void> {
    const tokens = await this.prisma.deviceToken.findMany({
      where: { userId },
      select: { token: true, platform: true },
    });
    await this.dispatchAndCleanup(
      tokens,
      PushPayloadBuilder.engagement({ title, body, deepLink }),
    );
  }

  // Admin-composed broadcast / targeted push. `destination` (optional) routes
  // the tap to a screen on the device via payload.type='admin_broadcast'.
  // `platform` (optional) restricts the broadcast to ios or android devices.
  // Fan-outs to both APNs and FCM; succeeds via whichever providers are configured.
  async sendAdminPush(dto: SendAdminPushDto): Promise<AdminPushResultDto> {
    if (!this.apns.isConfigured && !this.fcm.isConfigured) {
      throw new ServiceUnavailableException(
        'Neither APNs nor FCM is configured',
      );
    }

    let platformTokens: { token: string; platform: string }[];
    let unknownRecipients: string[] = [];

    if (dto.audience === AdminPushAudience.TARGETED) {
      const ids = new Set<number>();
      const emails = new Set<string>();
      for (const raw of dto.recipients ?? []) {
        const entry = raw.trim();
        if (entry === '') continue;
        if (/^\d+$/.test(entry)) {
          ids.add(Number(entry));
        } else {
          // Stored emails are persisted lowercase — normalize so mixed-case
          // input doesn't silently miss.
          emails.add(entry.toLowerCase());
        }
      }

      const users = await this.prisma.user.findMany({
        where: {
          OR: [{ id: { in: [...ids] } }, { email: { in: [...emails] } }],
        },
        select: { id: true, email: true },
      });

      const matchedIds = new Set(users.map((u) => u.id));
      const matchedEmails = new Set(users.map((u) => u.email.toLowerCase()));
      unknownRecipients = [
        ...[...ids].filter((id) => !matchedIds.has(id)).map(String),
        ...[...emails].filter((email) => !matchedEmails.has(email)),
      ];

      const userIds = users.map((u) => u.id);
      platformTokens = userIds.length
        ? await this.prisma.deviceToken.findMany({
            where: {
              userId: { in: userIds },
              ...(dto.platform ? { platform: dto.platform } : {}),
            },
            select: { token: true, platform: true },
          })
        : [];
    } else {
      platformTokens = await this.prisma.deviceToken.findMany({
        where: dto.platform ? { platform: dto.platform } : {},
        select: { token: true, platform: true },
      });
    }

    const iosTokens = platformTokens
      .filter((t) => t.platform === 'ios')
      .map((t) => t.token);
    const androidTokens = platformTokens
      .filter((t) => t.platform === 'android')
      .map((t) => t.token);

    const broadcastInput = {
      title: dto.title,
      body: dto.body,
      destination: dto.destination,
      // listingId only makes sense when the tap lands on the Market screen.
      listingId:
        dto.destination === AdminPushDestination.MARKET
          ? dto.listingId
          : undefined,
    };

    // No badge: a fixed value on a broadcast would clobber each user's real
    // unread count. Send via whichever providers are configured.
    const [apnsResult, fcmResult] = await Promise.all([
      this.apns.sendAdminBroadcast(iosTokens, broadcastInput),
      this.fcm.sendAdminBroadcast(androidTokens, broadcastInput),
    ]);

    const invalidTokens = [
      ...apnsResult.invalidTokens,
      ...fcmResult.invalidTokens,
    ];
    if (invalidTokens.length > 0) {
      await this.prisma.deviceToken.deleteMany({
        where: { token: { in: invalidTokens } },
      });
      this.logger.log(`Removed ${invalidTokens.length} invalid token(s)`);
    }

    return {
      recipientDevices: platformTokens.length,
      sent: apnsResult.sent + fcmResult.sent,
      failed: apnsResult.failed + fcmResult.failed,
      unknownRecipients,
    };
  }
}
