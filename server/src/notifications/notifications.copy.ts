import { EngagementLocale } from '@prisma/client';
import type { MissionId } from '../missions/mission-defs';

// Localized copy for every user-facing push notification. Mirrors the pattern
// in engagement/engagement.constants.ts (STATIC_TEMPLATES): one EN + one VN
// builder per push type, keyed by the recipient's `User.locale`. Dynamic values
// (names, trip names, message bodies) are interpolated, never translated.
//
// Vietnamese has no plural inflection, so the EN `pin`/`pins` style branches
// collapse on the VN side.

export type PushAlert = { title: string; subtitle?: string; body: string };

/** Normalize a possibly-null locale to a supported one (defaults to EN). */
export function pushLocale(locale?: EngagementLocale | null): EngagementLocale {
  return locale === EngagementLocale.VN
    ? EngagementLocale.VN
    : EngagementLocale.EN;
}

const pinFrom = (videoTitle?: string, en = true): string => {
  if (!videoTitle) return '';
  const clipped = videoTitle.slice(0, 48);
  return en ? ` from "${clipped}"` : ` từ "${clipped}"`;
};

export const PUSH_COPY = {
  friendRequest: {
    EN: (name: string): PushAlert => ({
      title: 'Friend Request',
      body: `${name} wants to be your friend`,
    }),
    VN: (name: string): PushAlert => ({
      title: 'Lời mời kết bạn',
      body: `${name} muốn kết bạn với bạn`,
    }),
  },
  friendAccepted: {
    EN: (name: string): PushAlert => ({
      title: 'Friend Request Accepted',
      body: `${name} accepted your friend request`,
    }),
    VN: (name: string): PushAlert => ({
      title: 'Đã chấp nhận lời mời kết bạn',
      body: `${name} đã chấp nhận lời mời kết bạn của bạn`,
    }),
  },
  tripRequestFulfilled: {
    EN: (destination: string): PushAlert => ({
      title: 'Your trip plan is ready',
      body: `A plan for ${destination} is now available on the Market`,
    }),
    VN: (destination: string): PushAlert => ({
      title: 'Kế hoạch chuyến đi của bạn đã sẵn sàng',
      body: `Đã có kế hoạch cho ${destination} trên Market`,
    }),
  },
  tripInvite: {
    EN: (inviter: string, tripName: string): PushAlert => ({
      title: 'Trip Invitation',
      body: `${inviter} invited you to ${tripName}`,
    }),
    VN: (inviter: string, tripName: string): PushAlert => ({
      title: 'Lời mời tham gia chuyến đi',
      body: `${inviter} đã mời bạn tham gia ${tripName}`,
    }),
  },
  // Fallback titles used only when a trip has no name (rare). Chat and the
  // trip-membership pushes otherwise use the trip name verbatim as the title.
  chatFallbackTitle: {
    EN: (): string => 'Trip Chat',
    VN: (): string => 'Trò chuyện nhóm',
  },
  tripFallbackTitle: {
    EN: (): string => 'Trip',
    VN: (): string => 'Chuyến đi',
  },
  memberLeft: {
    EN: (tripName: string, name: string): PushAlert => ({
      title: tripName,
      body: `${name} has left the trip`,
    }),
    VN: (tripName: string, name: string): PushAlert => ({
      title: tripName,
      body: `${name} đã rời khỏi chuyến đi`,
    }),
  },
  vaultLeaveAnnounced: {
    EN: (tripName: string, name: string): PushAlert => ({
      title: tripName,
      body: `${name} wants to leave — confirm settlement`,
    }),
    VN: (tripName: string, name: string): PushAlert => ({
      title: tripName,
      body: `${name} muốn rời nhóm — xác nhận quyết toán`,
    }),
  },
  memberJoined: {
    EN: (tripName: string, name: string): PushAlert => ({
      title: tripName,
      body: `${name} has joined the trip`,
    }),
    VN: (tripName: string, name: string): PushAlert => ({
      title: tripName,
      body: `${name} đã tham gia chuyến đi`,
    }),
  },
  // Trip auto-start (cron). Title is the trip name (dynamic).
  tripStarted: {
    EN: (tripName: string): PushAlert => ({
      title: tripName,
      body: 'Your trip has started. Have a great time!',
    }),
    VN: (tripName: string): PushAlert => ({
      title: tripName,
      body: 'Chuyến đi đã bắt đầu. Chúc bạn vui vẻ!',
    }),
  },
  tripAutoStartBlocked: {
    EN: (tripName: string, memberNames: string[]): PushAlert => ({
      title: tripName,
      body: `Couldn't start automatically: ${memberNames.join(', ')} ${
        memberNames.length === 1 ? 'is' : 'are'
      } still on another trip. Open the trip to start it.`,
    }),
    VN: (tripName: string, memberNames: string[]): PushAlert => ({
      title: tripName,
      body: `Không thể tự động bắt đầu: ${memberNames.join(', ')} vẫn đang trong chuyến đi khác. Mở chuyến đi để bắt đầu.`,
    }),
  },
  // Plan reminder: title is the trip name (dynamic). Only the connector between
  // the item title, time and location is localized.
  planReminder: {
    EN: (
      tripName: string,
      itemTitle: string,
      startTime: string,
      location: string | null,
    ): PushAlert => ({
      title: tripName,
      body: location
        ? `${itemTitle} at ${startTime} • ${location}`
        : `${itemTitle} at ${startTime}`,
    }),
    VN: (
      tripName: string,
      itemTitle: string,
      startTime: string,
      location: string | null,
    ): PushAlert => ({
      title: tripName,
      body: location
        ? `${itemTitle} lúc ${startTime} • ${location}`
        : `${itemTitle} lúc ${startTime}`,
    }),
  },
  listingStatus: {
    EN: (listingName: string, approved: boolean): PushAlert => ({
      title: approved ? 'Listing approved' : 'Listing rejected',
      body: approved
        ? `Your listing "${listingName}" was approved.`
        : `Your listing "${listingName}" was rejected.`,
    }),
    VN: (listingName: string, approved: boolean): PushAlert => ({
      title: approved ? 'Tin đăng được duyệt' : 'Tin đăng bị từ chối',
      body: approved
        ? `Tin đăng "${listingName}" của bạn đã được duyệt.`
        : `Tin đăng "${listingName}" của bạn đã bị từ chối.`,
    }),
  },
  pinExtractionDone: {
    EN: (pinCount: number, videoTitle?: string): PushAlert => ({
      title: 'Pins ready!',
      body: `${pinCount} pin${pinCount === 1 ? '' : 's'} extracted${pinFrom(videoTitle, true)}.`,
    }),
    VN: (pinCount: number, videoTitle?: string): PushAlert => ({
      title: 'Pins đã sẵn sàng!',
      body: `Đã trích xuất ${pinCount} pin${pinFrom(videoTitle, false)}.`,
    }),
  },
  missionCompleted: {
    EN: (missionName: string, reward: number): PushAlert => ({
      title: 'Mission complete! ⚡',
      body: `${missionName} — you earned ${reward}⚡.`,
    }),
    VN: (missionName: string, reward: number): PushAlert => ({
      title: 'Hoàn thành nhiệm vụ! ⚡',
      body: `${missionName} — bạn nhận được ${reward}⚡.`,
    }),
  },
  pinExtractionFailed: {
    EN: (): PushAlert => ({
      title: 'Extraction failed',
      body: "We couldn't pull pins from that video. Tap to see details.",
    }),
    VN: (): PushAlert => ({
      title: 'Trích xuất thất bại',
      body: 'Không thể lấy pin từ video đó. Chạm để xem chi tiết.',
    }),
  },
} as const;

// Mission display names for the mission_completed push, kept in sync with the
// iOS copy table (MissionsSheetView.swift EN / Localizable.xcstrings vi) so
// the banner and the missions sheet say the same thing.
export const MISSION_PUSH_NAMES: Record<MissionId, { EN: string; VN: string }> =
  {
    first_trip: {
      EN: 'Create your first trip',
      VN: 'Tạo chuyến đi đầu tiên',
    },
    first_board: {
      EN: 'Create 1 board',
      VN: 'Tạo 1 Bảng',
    },
    first_scan: {
      EN: 'Scan 1 social video',
      VN: 'Quét 1 video mạng xã hội',
    },
    first_expense: {
      EN: 'Add your first expense',
      VN: 'Thêm chi phí đầu tiên',
    },
    apply_plan: {
      EN: 'Apply a plan from Market',
      VN: 'Áp dụng một kế hoạch từ Chợ',
    },
    invite_2: {
      EN: 'Invite 2 friends to your trip',
      VN: 'Mời 2 người bạn vào chuyến đi',
    },
    friend_joined: {
      EN: 'A friend joined your trip',
      VN: 'Một người bạn đã tham gia chuyến đi',
    },
    trip_settled: {
      EN: 'Complete a trip with expenses settled',
      VN: 'Hoàn thành chuyến đi và chia tiền xong',
    },
    share_plan: {
      EN: 'Share a plan from Market',
      VN: 'Chia sẻ một kế hoạch từ Chợ',
    },
    rate_plan: {
      EN: 'Rate a plan you applied',
      VN: 'Đánh giá kế hoạch bạn đã áp dụng',
    },
    upload_plan: {
      EN: 'Upload your plan to Market',
      VN: 'Đăng kế hoạch của bạn lên Chợ',
    },
    appstore_review: {
      EN: 'Give us a review on the App Store',
      VN: 'Đánh giá chúng tôi trên App Store',
    },
    plan_ahead: {
      EN: 'Plan your next trip',
      VN: 'Lên kế hoạch chuyến đi tiếp theo',
    },
  };
