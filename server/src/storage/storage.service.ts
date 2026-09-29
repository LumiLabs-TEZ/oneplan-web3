import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage, Bucket } from '@google-cloud/storage';
import { ActivityAction } from '@prisma/client';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { TripActivityService } from '../trip-activity/trip-activity.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { ANALYTICS_EVENTS } from '../analytics/constants/events';
import {
  UploadTarget,
  UPLOAD_TARGET_CONFIGS,
} from './constants/upload-targets';
import { PresignUploadDto } from './dto/presign-upload.dto';
import { PresignedUrlDto } from './dto/presigned-url.dto';
import { ConfirmUploadDto } from './dto/confirm-upload.dto';
import { UploadResultDto } from './dto/upload-result.dto';
import { DownloadUrlDto } from './dto/download-url.dto';
import { randomBytes } from 'crypto';

const PRESIGN_EXPIRY_SECONDS = 600;
const DOWNLOAD_EXPIRY_SECONDS = 3600;

const THUMB_SUFFIX = '.thumb.webp';
const THUMB_WIDTH = 1200;
const THUMB_QUALITY = 75;
const THUMB_EXISTS_TTL_MS = 60 * 60 * 1000;

@Injectable()
export class StorageService implements OnModuleInit {
  private storage: Storage;
  private bucket: Bucket;
  private bucketName: string;
  private readonly logger = new Logger(StorageService.name);
  private readonly thumbExistsCache = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly activityService: TripActivityService,
    private readonly analytics: AnalyticsService,
  ) {}

  onModuleInit() {
    this.bucketName = this.config.getOrThrow<string>('GCS_MEDIA_BUCKET');
    const projectId =
      this.config.get<string>('GOOGLE_CLOUD_PROJECT') || undefined;
    // Storage uses its own SA (STORAGE_SA_KEY_FILE), separate from the
    // Vertex/Gemini SA (VERTEX_SA_KEY_FILE). Empty falls through to ADC for
    // local dev via `gcloud auth application-default login`.
    const keyFilename =
      this.config.get<string>('STORAGE_SA_KEY_FILE') || undefined;

    this.storage = new Storage({
      projectId,
      keyFilename,
    });
    this.bucket = this.storage.bucket(this.bucketName);
  }

  async createPresignedUpload(
    dto: PresignUploadDto,
    userEmail?: string,
  ): Promise<PresignedUrlDto> {
    const targetConfig = UPLOAD_TARGET_CONFIGS[dto.target];

    this.assertCanUploadToTarget(dto.target, userEmail);

    if (!targetConfig.allowedContentTypes.includes(dto.contentType)) {
      throw new BadRequestException(
        `Content type ${dto.contentType} is not allowed for ${dto.target}. Allowed: ${targetConfig.allowedContentTypes.join(', ')}`,
      );
    }

    await this.verifyEntityExists(dto.target, dto.entityId);

    const ext = this.extensionFromMime(dto.contentType);
    const uniqueSuffix = `${Date.now()}-${this.randomId()}`;
    const prefix = targetConfig.pathPrefix.replace(
      '{entityId}',
      String(dto.entityId),
    );
    const objectKey = `${prefix}/${uniqueSuffix}${ext}`;

    const [uploadUrl] = await this.bucket.file(objectKey).getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: Date.now() + PRESIGN_EXPIRY_SECONDS * 1000,
      contentType: dto.contentType,
    });

    return {
      uploadUrl,
      objectKey,
      expiresIn: PRESIGN_EXPIRY_SECONDS,
    };
  }

  async confirmUpload(
    dto: ConfirmUploadDto,
    userId: number,
    userEmail?: string,
  ): Promise<UploadResultDto> {
    const targetConfig = UPLOAD_TARGET_CONFIGS[dto.target];

    this.assertCanUploadToTarget(dto.target, userEmail);

    const expectedPrefix = targetConfig.pathPrefix.replace(
      '{entityId}',
      String(dto.entityId),
    );

    if (!dto.objectKey.startsWith(expectedPrefix)) {
      throw new BadRequestException(
        'Object key does not match the expected path for this target and entity',
      );
    }

    const [exists] = await this.bucket.file(dto.objectKey).exists();
    if (!exists) {
      throw new NotFoundException(
        'Object not found in storage. Upload may have failed or expired.',
      );
    }

    if (this.isImageTarget(dto.target)) {
      await this.generateThumbnail(dto.objectKey);
    }

    const url = await this.getSignedDownloadUrl(dto.objectKey);
    await this.persistUrl(dto, userId);

    return { url: url.url, objectKey: dto.objectKey };
  }

  // Server-direct upload of an in-memory Buffer (no presigned client round
  // trip). Used by server-side generators that already hold image bytes.
  // Returns the bare object key to store (signed URLs are produced on read).
  async uploadBuffer(
    target: UploadTarget,
    entityId: number | string,
    buffer: Buffer,
    contentType: string,
  ): Promise<string> {
    const targetConfig = UPLOAD_TARGET_CONFIGS[target];
    if (!targetConfig.allowedContentTypes.includes(contentType)) {
      throw new BadRequestException(
        `Content type ${contentType} is not allowed for ${target}.`,
      );
    }
    if (buffer.length > targetConfig.maxSizeBytes) {
      throw new BadRequestException(`File too large for ${target}.`);
    }
    const ext = this.extensionFromMime(contentType);
    const prefix = targetConfig.pathPrefix.replace(
      '{entityId}',
      String(entityId),
    );
    const objectKey = `${prefix}/${Date.now()}-${this.randomId()}${ext}`;
    await this.bucket
      .file(objectKey)
      .save(buffer, { resumable: false, contentType });
    return objectKey;
  }

  async getSignedDownloadUrl(objectKey: string): Promise<DownloadUrlDto> {
    const [url] = await this.bucket.file(objectKey).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + DOWNLOAD_EXPIRY_SECONDS * 1000,
    });

    return { url, expiresIn: DOWNLOAD_EXPIRY_SECONDS };
  }

  async getSignedThumbUrl(objectKey: string): Promise<DownloadUrlDto> {
    if (objectKey.endsWith(THUMB_SUFFIX)) {
      return this.getSignedDownloadUrl(objectKey);
    }

    const thumbKey = `${objectKey}${THUMB_SUFFIX}`;
    if (await this.thumbExists(thumbKey)) {
      return this.getSignedDownloadUrl(thumbKey);
    }
    return this.getSignedDownloadUrl(objectKey);
  }

  private async thumbExists(thumbKey: string): Promise<boolean> {
    const cached = this.thumbExistsCache.get(thumbKey);
    if (cached !== undefined && cached > Date.now()) return true;

    const [exists] = await this.bucket.file(thumbKey).exists();
    if (exists) {
      this.thumbExistsCache.set(thumbKey, Date.now() + THUMB_EXISTS_TTL_MS);
    }
    return exists;
  }

  private async generateThumbnail(objectKey: string): Promise<void> {
    if (objectKey.endsWith(THUMB_SUFFIX)) return;

    try {
      const [buf] = await this.bucket.file(objectKey).download();
      const thumb = await sharp(buf)
        .rotate()
        .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
        .webp({ quality: THUMB_QUALITY })
        .toBuffer();

      const thumbKey = `${objectKey}${THUMB_SUFFIX}`;
      await this.bucket.file(thumbKey).save(thumb, {
        resumable: false,
        contentType: 'image/webp',
      });
      this.thumbExistsCache.set(thumbKey, Date.now() + THUMB_EXISTS_TTL_MS);
    } catch (error) {
      this.logger.warn(`Failed to generate thumb for ${objectKey}: ${error}`);
    }
  }

  private isImageTarget(target: UploadTarget): boolean {
    return UPLOAD_TARGET_CONFIGS[target].allowedContentTypes.every((t) =>
      t.startsWith('image/'),
    );
  }

  /**
   * Targets flagged `adminOnly` cover admin-owned entities (e.g. journals) that
   * are wired into the generic upload flow. The presign/confirm endpoints sit
   * behind JwtAuthGuard only, so without this check any authenticated user who
   * knows the entity id could overwrite the asset. Mirrors AdminGuard's
   * email-allowlist check. Gating both presign and confirm means a caller can
   * neither obtain an upload URL nor persist a key for an admin-only target.
   */
  private assertCanUploadToTarget(
    target: UploadTarget,
    userEmail?: string,
  ): void {
    if (!UPLOAD_TARGET_CONFIGS[target].adminOnly) return;

    const adminEmails = this.config.get<string[]>('admin.emails') ?? [];
    if (!userEmail || !adminEmails.includes(userEmail.toLowerCase())) {
      throw new ForbiddenException(
        'Admin access required for this upload target',
      );
    }
  }

  private async verifyEntityExists(
    target: UploadTarget,
    entityId: number,
  ): Promise<void> {
    try {
      switch (target) {
        case UploadTarget.USER_AVATAR:
          await this.prisma.user.findUniqueOrThrow({
            where: { id: entityId },
          });
          break;
        case UploadTarget.TRIP_COVER:
        case UploadTarget.TRIP_PHOTO:
        case UploadTarget.PLAN_ITEM_VOICE:
        case UploadTarget.PLAN_ITEM_IMAGE:
          await this.prisma.trip.findUniqueOrThrow({
            where: { id: entityId },
          });
          break;
        case UploadTarget.EXPENSE_RECEIPT:
          await this.prisma.expense.findUniqueOrThrow({
            where: { id: entityId },
          });
          break;
        case UploadTarget.MARKET_ITEM_IMAGE:
          await this.prisma.marketplaceListing.findUniqueOrThrow({
            where: { id: entityId },
          });
          break;
        case UploadTarget.BOARD_COVER:
          await this.prisma.board.findUniqueOrThrow({
            where: { id: entityId },
          });
          break;
        case UploadTarget.JOURNAL_COVER:
          await this.prisma.journal.findUniqueOrThrow({
            where: { id: entityId },
          });
          break;
      }
    } catch {
      throw new NotFoundException(
        `Entity not found for target ${target} with id ${entityId}`,
      );
    }
  }

  private async persistUrl(
    dto: ConfirmUploadDto,
    userId: number,
  ): Promise<void> {
    switch (dto.target) {
      case UploadTarget.USER_AVATAR: {
        const existing = await this.prisma.user.findUnique({
          where: { id: dto.entityId },
          select: { avatarUrl: true },
        });
        await this.prisma.user.update({
          where: { id: dto.entityId },
          data: { avatarUrl: dto.objectKey },
        });
        if (existing?.avatarUrl) {
          await this.deleteObject(existing.avatarUrl);
        }
        break;
      }
      case UploadTarget.TRIP_COVER: {
        const existing = await this.prisma.trip.findUnique({
          where: { id: dto.entityId },
          select: { coverImageUrl: true },
        });
        await this.prisma.trip.update({
          where: { id: dto.entityId },
          data: { coverImageUrl: dto.objectKey },
        });
        if (existing?.coverImageUrl) {
          await this.deleteObject(existing.coverImageUrl);
        }
        break;
      }
      case UploadTarget.TRIP_PHOTO: {
        const photo = await this.prisma.tripPhoto.create({
          data: {
            tripId: dto.entityId,
            uploadedById: userId,
            photoUrl: dto.objectKey,
            caption: dto.caption,
          },
        });
        this.activityService.log(
          dto.entityId,
          userId,
          ActivityAction.PHOTO_UPLOADED,
          photo.id,
          { caption: dto.caption },
        );
        void this.analytics.track(ANALYTICS_EVENTS.TRIP_PHOTO_UPLOADED, {
          userId,
          properties: { tripId: dto.entityId, photoId: photo.id },
        });
        break;
      }
      case UploadTarget.EXPENSE_RECEIPT: {
        const existing = await this.prisma.expense.findUnique({
          where: { id: dto.entityId },
          select: { receiptUrl: true },
        });
        await this.prisma.expense.update({
          where: { id: dto.entityId },
          data: { receiptUrl: dto.objectKey },
        });
        if (existing?.receiptUrl) {
          await this.deleteObject(existing.receiptUrl);
        }
        break;
      }
      case UploadTarget.PLAN_ITEM_VOICE:
        break;
      case UploadTarget.PLAN_ITEM_IMAGE:
        // Plan-item images are stored by object key on the plan item record.
        // Nothing to persist during confirm step.
        break;
      case UploadTarget.MARKET_ITEM_IMAGE:
        // Marketplace media is stored by object key in listing/item records.
        // Nothing to persist during confirm step.
        break;
      case UploadTarget.BOARD_COVER: {
        const existing = await this.prisma.board.findUnique({
          where: { id: dto.entityId },
          select: { coverImageUrl: true },
        });
        await this.prisma.board.update({
          where: { id: dto.entityId },
          data: { coverImageUrl: dto.objectKey },
        });
        if (existing?.coverImageUrl) {
          await this.deleteObject(existing.coverImageUrl);
        }
        break;
      }
      case UploadTarget.JOURNAL_COVER: {
        const existing = await this.prisma.journal.findUnique({
          where: { id: dto.entityId },
          select: { coverImageKey: true },
        });
        await this.prisma.journal.update({
          where: { id: dto.entityId },
          data: { coverImageKey: dto.objectKey },
        });
        if (existing?.coverImageKey) {
          await this.deleteObject(existing.coverImageKey);
        }
        break;
      }
    }
  }

  /**
   * Copies an existing object into a target's path (fresh generated key) and
   * returns the new key. Used to give an entity its own independent copy of
   * media owned elsewhere (e.g. marketplace item images applied to a trip),
   * so deleting either side never orphans the other. The `<key>.thumb.webp`
   * sibling is copied too when present (best effort).
   */
  async copyToTarget(
    sourceKey: string,
    target: UploadTarget,
    entityId: number,
  ): Promise<string> {
    const prefix = UPLOAD_TARGET_CONFIGS[target].pathPrefix.replace(
      '{entityId}',
      String(entityId),
    );
    // Preserve the source extension; no MIME is available at copy time.
    const extMatch = /\.[A-Za-z0-9]+$/.exec(sourceKey);
    const ext = extMatch ? extMatch[0] : '';
    const destinationKey = `${prefix}/${Date.now()}-${this.randomId()}${ext}`;

    await this.bucket.file(sourceKey).copy(this.bucket.file(destinationKey));

    const sourceThumbKey = `${sourceKey}${THUMB_SUFFIX}`;
    try {
      if (await this.thumbExists(sourceThumbKey)) {
        await this.bucket
          .file(sourceThumbKey)
          .copy(this.bucket.file(`${destinationKey}${THUMB_SUFFIX}`));
      }
    } catch {
      // Thumb copy is best effort; the full-size copy above is what matters.
    }

    return destinationKey;
  }

  async deleteObject(objectKey: string): Promise<void> {
    try {
      await this.bucket.file(objectKey).delete({ ignoreNotFound: true });
    } catch (error) {
      this.logger.warn(`Failed to delete old object ${objectKey}: ${error}`);
    }

    if (!objectKey.endsWith(THUMB_SUFFIX)) {
      const thumbKey = `${objectKey}${THUMB_SUFFIX}`;
      try {
        await this.bucket.file(thumbKey).delete({ ignoreNotFound: true });
      } catch {
        // Sibling thumb may not exist (audio, legacy uploads); ignore.
      }
      this.thumbExistsCache.delete(thumbKey);
    }
  }

  private extensionFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'audio/mp4': '.m4a',
      'audio/mpeg': '.mp3',
    };
    return map[mime] ?? '.bin';
  }

  // Strips a stored URL down to its bare object key. Handles both the new GCS
  // host (`https://storage.googleapis.com/<bucket>/...`) and the legacy Supabase
  // S3 endpoint (`.../storage/v1/s3/<bucket>/...`) so any DB rows that still
  // contain pre-migration full URLs continue to resolve.
  extractObjectKey(value: string): string {
    if (!/^https?:\/\//i.test(value)) return value;
    try {
      const parsed = new URL(value);

      // GCS path-style: https://storage.googleapis.com/<bucket>/<key>
      if (parsed.hostname === 'storage.googleapis.com') {
        const gcsPrefix = `/${this.bucketName}/`;
        const idx = parsed.pathname.indexOf(gcsPrefix);
        if (idx !== -1) {
          return decodeURIComponent(
            parsed.pathname.slice(idx + gcsPrefix.length),
          );
        }
      }

      // GCS virtual-hosted: https://<bucket>.storage.googleapis.com/<key>
      if (parsed.hostname === `${this.bucketName}.storage.googleapis.com`) {
        return decodeURIComponent(parsed.pathname.replace(/^\//, ''));
      }

      // Legacy Supabase S3: .../storage/v1/s3/<bucket>/<key>
      const supabasePrefix = `/storage/v1/s3/${this.bucketName}/`;
      const supabaseIdx = parsed.pathname.indexOf(supabasePrefix);
      if (supabaseIdx !== -1) {
        return decodeURIComponent(
          parsed.pathname.slice(supabaseIdx + supabasePrefix.length),
        );
      }

      return value;
    } catch {
      return value;
    }
  }

  private randomId(): string {
    return randomBytes(6).toString('hex');
  }
}
