export enum UploadTarget {
  USER_AVATAR = 'user-avatar',
  TRIP_COVER = 'trip-cover',
  TRIP_PHOTO = 'trip-photo',
  EXPENSE_RECEIPT = 'expense-receipt',
  PLAN_ITEM_VOICE = 'plan-item-voice',
  PLAN_ITEM_IMAGE = 'plan-item-image',
  MARKET_ITEM_IMAGE = 'market-item-image',
  BOARD_COVER = 'board-cover',
  JOURNAL_COVER = 'journal-cover',
}

export interface UploadTargetConfig {
  /** S3 path prefix template. Placeholders: {entityId} */
  pathPrefix: string;
  /** Allowed MIME types */
  allowedContentTypes: string[];
  /** Max file size in bytes */
  maxSizeBytes: number;
  /**
   * When true, only admins (email in the admin allowlist) may presign or
   * confirm uploads for this target. Use for admin-owned entities wired into
   * the generic upload flow, where entity ownership alone does not gate access.
   */
  adminOnly?: boolean;
}

export const UPLOAD_TARGET_CONFIGS: Record<UploadTarget, UploadTargetConfig> = {
  [UploadTarget.USER_AVATAR]: {
    pathPrefix: 'users/{entityId}/avatar',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 5 * 1024 * 1024,
  },
  [UploadTarget.TRIP_COVER]: {
    pathPrefix: 'trips/{entityId}/cover',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
  },
  [UploadTarget.TRIP_PHOTO]: {
    pathPrefix: 'trips/{entityId}/photos',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 15 * 1024 * 1024,
  },
  [UploadTarget.EXPENSE_RECEIPT]: {
    pathPrefix: 'expenses/{entityId}/receipts',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
  },
  [UploadTarget.PLAN_ITEM_VOICE]: {
    pathPrefix: 'trips/{entityId}/voice',
    allowedContentTypes: ['audio/mp4', 'audio/m4a', 'audio/mpeg'],
    maxSizeBytes: 10 * 1024 * 1024,
  },
  [UploadTarget.PLAN_ITEM_IMAGE]: {
    pathPrefix: 'trips/{entityId}/plan-images',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
  },
  [UploadTarget.MARKET_ITEM_IMAGE]: {
    pathPrefix: 'marketplace/{entityId}/images',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
  },
  [UploadTarget.BOARD_COVER]: {
    pathPrefix: 'boards/{entityId}/cover',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
  },
  [UploadTarget.JOURNAL_COVER]: {
    pathPrefix: 'journal/{entityId}/cover',
    allowedContentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxSizeBytes: 10 * 1024 * 1024,
    adminOnly: true,
  },
};
