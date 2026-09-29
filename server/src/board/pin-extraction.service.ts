import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import {
  AnalyticsEventName,
  PinExtractionStatus,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { Observable, Subject } from 'rxjs';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ExtractedPinDto,
  PinExtractionSessionDto,
  PinExtractionSessionStatus,
} from './dto/extracted-pin.dto';
import {
  GeminiService,
  type ExtractedPin,
} from '../common/gemini/gemini.service';
import {
  VideoResolverError,
  VideoResolverService,
} from './video-resolver.service';
import { ScanCreditService } from '../scan-credit/scan-credit.service';
import { InsufficientScanCreditsException } from '../scan-credit/insufficient-scan-credits.exception';
import { AnalyticsService } from '../analytics/analytics.service';
import { MissionsService } from '../missions/missions.service';

const CACHE_REPLAY_PIN_DELAY_MS = 260;
const KEEPALIVE_INTERVAL_MS = 10_000;
// Sessions whose updatedAt is older than this AND that have no entry in
// `liveSubjects` are presumed orphaned by a crash and flipped to FAILED.
const STALENESS_MS = 10 * 60 * 1000;

export type ExtractionEventType =
  | 'status'
  | 'video_meta'
  | 'pin'
  | 'done'
  | 'error'
  | 'keepalive';

export type ExtractionPhase =
  | 'queued'
  | 'cache_hit'
  | 'resolving'
  | 'uploading'
  | 'processing'
  | 'analyzing';

export interface VideoMeta {
  title?: string;
  description?: string;
  uploader?: string;
  thumbnail?: string;
}

export interface ExtractionEvent {
  type: ExtractionEventType;
  data:
    | { phase: ExtractionPhase; message?: string }
    | VideoMeta
    | ExtractedPinDto
    | { sessionId: string; pinCount: number; fromCache: boolean }
    | { code: string; message: string }
    | { ts: number };
}

interface CachePayload {
  pins: ExtractedPin[];
  meta?: VideoMeta;
}

// In-memory bookkeeping for a session that's actively running. The Subject is
// the multicast for live SSE consumers; the AbortController lets cancel()
// stop the work mid-flight.
interface LiveSession {
  subject: Subject<ExtractionEvent>;
  abortController: AbortController;
}

@Injectable()
export class PinExtractionService {
  private readonly logger = new Logger(PinExtractionService.name);
  private readonly liveSessions = new Map<string, LiveSession>();
  private readonly cacheTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly resolver: VideoResolverService,
    private readonly gemini: GeminiService,
    private readonly notifications: NotificationsService,
    private readonly scanCredit: ScanCreditService,
    private readonly analytics: AnalyticsService,
    private readonly config: ConfigService,
    private readonly missions: MissionsService,
  ) {
    const days = this.config.get<number>('PIN_EXTRACTION_CACHE_TTL_DAYS');
    const ttlDays = typeof days === 'number' && days > 0 ? days : 7;
    this.cacheTtlMs = ttlDays * 24 * 60 * 60 * 1000;
  }

  // Classify a (canonicalized) source URL by platform for analytics. The URL
  // has already been normalized in startSession, so a substring match on the
  // host is sufficient.
  private platformOf(sourceUrl: string): 'tiktok' | 'instagram' | 'other' {
    if (!sourceUrl) return 'other';
    let host = sourceUrl.toLowerCase();
    try {
      host = new URL(sourceUrl).hostname.toLowerCase();
    } catch {
      // Not a parseable URL — fall back to substring-matching the raw string.
    }
    if (host.includes('tiktok')) return 'tiktok';
    if (host.includes('instagram')) return 'instagram';
    return 'other';
  }

  // ── Public API ──────────────────────────────────────────────────────────

  // Validates a pasted URL and creates a session row, returning its id. If
  // the user already has a session for the same urlHash, returns that one
  // (idempotent paste). If they have a session for a different urlHash,
  // throws ConflictException with the existing sessionId so the client can
  // navigate to it.
  async startSession(
    rawUrl: string,
    userId: number,
  ): Promise<{ sessionId: string }> {
    const canonicalUrl = await this.resolver.canonicalizeSourceUrl(rawUrl);
    const urlHash = createHash('sha256').update(canonicalUrl).digest('hex');

    // Reuse: same user + same URL, in any non-dismissed state.
    const existing = await this.prisma.pinExtractionSession.findFirst({
      where: {
        userId,
        urlHash,
        dismissedAt: null,
        status: {
          in: [
            PinExtractionStatus.QUEUED,
            PinExtractionStatus.RUNNING,
            PinExtractionStatus.DONE,
          ],
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      return { sessionId: existing.id };
    }

    // Conflict: same user has a different URL currently running.
    const live = await this.prisma.pinExtractionSession.findFirst({
      where: {
        userId,
        status: {
          in: [PinExtractionStatus.QUEUED, PinExtractionStatus.RUNNING],
        },
      },
    });
    if (live) {
      throw new ConflictException({
        code: 'extraction_in_progress',
        message: 'You already have an extraction running. Cancel it first.',
        sessionId: live.id,
      });
    }

    // A scan is free only if BOTH hold: (1) this user already paid for this
    // urlHash — via a still-standing (non-refunded) credit consumption on a
    // prior session of theirs, and (2) the cache row is still within its TTL.
    // Otherwise we charge, then spawnRun serves the payload from cache below
    // (the Gemini cost is genuinely saved, but the extraction RESULT is what
    // gets sold — see #194). A cache hit alone is never sufficient; it used
    // to let every OTHER user ride the first payer's charge for free.
    const cached = await this.getValidCache(urlHash);
    const alreadyPaid = cached
      ? await this.hasUserPaidForUrl(userId, urlHash)
      : false;

    const row = await this.prisma.pinExtractionSession.create({
      data: {
        userId,
        sourceUrl: canonicalUrl,
        urlHash,
        status: PinExtractionStatus.QUEUED,
        pins: [],
      },
    });

    if (!alreadyPaid) {
      try {
        await this.scanCredit.consume(userId, row.id);
      } catch (err) {
        // Insufficient credits — roll back the empty session row so the
        // user's active-session lookup doesn't show a ghost. Refund is
        // unnecessary because consume threw before writing the consumption
        // row.
        await this.prisma.pinExtractionSession
          .delete({ where: { id: row.id } })
          .catch((delErr) =>
            this.logger.warn(
              `failed to roll back session ${row.id} after credit reject: ${(delErr as Error).message}`,
            ),
          );
        // Only the out-of-credits case is the monetization "hit the wall"
        // signal — other throws (e.g. DB errors) are not. The available /
        // nextProGrantAt values live in the HttpException response body, not
        // as direct properties.
        if (err instanceof InsufficientScanCreditsException) {
          const body = err.getResponse();
          const props =
            typeof body === 'object' && body !== null
              ? (body as { available?: number; nextProGrantAt?: string | null })
              : {};
          void this.analytics.track(AnalyticsEventName.PIN_QUOTA_BLOCKED, {
            userId,
            properties: {
              available: props.available ?? 0,
              nextProGrantAt: props.nextProGrantAt ?? null,
            },
          });
        }
        throw err;
      }
    }

    // Funnel-entry signal: a genuinely new session was created (the reuse and
    // 409-conflict branches returned earlier). Fires for cache-hit sessions
    // too — it's "session created", not "credit charged"; fromCache is
    // reported on PIN_EXTRACTION_FINISHED.
    void this.analytics.track(AnalyticsEventName.PIN_EXTRACTION_STARTED, {
      userId,
      properties: {
        sessionId: row.id,
        platform: this.platformOf(canonicalUrl),
        mediaType: this.resolver.isTikTokPhotoUrl(canonicalUrl)
          ? 'photo'
          : 'video',
      },
    });

    // Subject MUST be registered synchronously, before spawnRun's first
    // await. A client that POSTs and immediately GETs the stream within
    // the same RTT would otherwise hit the "no live subject" branch and
    // get an orphan error for a perfectly healthy session.
    const subject = new Subject<ExtractionEvent>();
    const abortController = new AbortController();
    this.liveSessions.set(row.id, { subject, abortController });

    // Fire-and-forget. spawnRun owns cleanup of liveSessions, the abort
    // signal lifecycle, and the terminal-state DB write.
    void this.spawnRun(row.id, subject, abortController.signal).catch((err) => {
      this.logger.error(
        `spawnRun for ${row.id} threw at top level: ${(err as Error).message}`,
      );
    });

    return { sessionId: row.id };
  }

  // Returns the user's most recent non-dismissed session (any status), or
  // null. BoardScanningCard binds to this.
  async getActiveSession(
    userId: number,
  ): Promise<PinExtractionSessionDto | null> {
    const row = await this.prisma.pinExtractionSession.findFirst({
      where: { userId, dismissedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return row ? this.toDto(row) : null;
  }

  async getSession(
    sessionId: string,
    userId: number,
  ): Promise<PinExtractionSessionDto> {
    const row = await this.prisma.pinExtractionSession.findUnique({
      where: { id: sessionId },
    });
    if (!row) throw new NotFoundException('Session not found');
    if (row.userId !== userId) throw new ForbiddenException();
    return this.toDto(row);
  }

  // Cancels a running session OR dismisses a terminal one. The card on
  // iOS uses the same endpoint for both — semantically, "make this go
  // away from my UI" — and the server picks the right action based on
  // current status.
  async cancelOrDismissSession(
    sessionId: string,
    userId: number,
  ): Promise<void> {
    const row = await this.prisma.pinExtractionSession.findUnique({
      where: { id: sessionId },
    });
    if (!row) throw new NotFoundException('Session not found');
    if (row.userId !== userId) throw new ForbiddenException();

    if (
      row.status === PinExtractionStatus.QUEUED ||
      row.status === PinExtractionStatus.RUNNING
    ) {
      // Abort the in-flight run. spawnRun's finally will write CANCELLED
      // to the DB and clean up liveSessions.
      const live = this.liveSessions.get(sessionId);
      live?.abortController.abort();
      // If for some reason there's no live entry (e.g. server bounced and
      // the row is genuinely orphaned), mark it directly.
      if (!live) {
        await this.prisma.pinExtractionSession.update({
          where: { id: sessionId },
          data: {
            status: PinExtractionStatus.CANCELLED,
            completedAt: new Date(),
            dismissedAt: new Date(),
          },
        });
        // spawnRun's finally won't run for this orphan; refund directly.
        await this.scanCredit.refund(sessionId);
      } else {
        // Live cancel — also mark dismissed so the card disappears.
        await this.prisma.pinExtractionSession.update({
          where: { id: sessionId },
          data: { dismissedAt: new Date() },
        });
      }
    } else {
      // Terminal — just dismiss.
      await this.prisma.pinExtractionSession.update({
        where: { id: sessionId },
        data: { dismissedAt: new Date() },
      });
    }
  }

  // Opens the SSE stream for a session. Replays whatever has been persisted
  // so far (phase, video_meta, pins), then either completes (terminal
  // session) or attaches to the live Subject for the remaining events.
  stream(sessionId: string, userId: number): Observable<ExtractionEvent> {
    return new Observable<ExtractionEvent>((subscriber) => {
      const heartbeat = setInterval(() => {
        if (!subscriber.closed) {
          subscriber.next({ type: 'keepalive', data: { ts: Date.now() } });
        }
      }, KEEPALIVE_INTERVAL_MS);

      let liveSub: { unsubscribe: () => void } | null = null;

      void (async () => {
        const row = await this.prisma.pinExtractionSession.findUnique({
          where: { id: sessionId },
        });
        if (!row || row.userId !== userId) {
          subscriber.next({
            type: 'error',
            data: {
              code: 'unknown_session',
              message: 'Session not found. Re-paste the URL.',
            },
          });
          subscriber.complete();
          return;
        }

        // Replay everything we already have.
        this.replayPersisted(row, subscriber);

        // Terminal — emit the appropriate done/error and complete.
        if (this.isTerminal(row.status)) {
          this.emitTerminal(row, subscriber);
          subscriber.complete();
          return;
        }

        // Still running — attach to the live Subject for the rest. If no
        // live entry exists despite the row being non-terminal, it's a
        // genuine orphan (server crashed mid-extraction). The cleanup
        // cron will flip it; surface the error now.
        const live = this.liveSessions.get(sessionId);
        if (!live) {
          subscriber.next({
            type: 'error',
            data: {
              code: 'orphaned',
              message: 'Extraction was interrupted. Try again.',
            },
          });
          subscriber.complete();
          return;
        }

        const inner = live.subject.subscribe({
          next: (event) => subscriber.next(event),
          error: (err) => subscriber.error(err),
          complete: () => subscriber.complete(),
        });
        liveSub = { unsubscribe: () => inner.unsubscribe() };
      })();

      return () => {
        clearInterval(heartbeat);
        liveSub?.unsubscribe();
      };
    });
  }

  // ── DTO mapping ─────────────────────────────────────────────────────────

  private toDto(
    row: Prisma.PinExtractionSessionGetPayload<object>,
  ): PinExtractionSessionDto {
    const pins = this.coercePinsJson(row.pins);
    return {
      id: row.id,
      sourceUrl: row.sourceUrl,
      status: row.status as unknown as PinExtractionSessionStatus,
      phase: row.phase ?? undefined,
      videoMeta: this.coerceMetaJson(row.videoMeta) ?? undefined,
      pins,
      pinCount: pins.length,
      fromCache: row.fromCache,
      errorCode: row.errorCode ?? undefined,
      errorMessage: row.errorMessage ?? undefined,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString(),
    };
  }

  // ── Replay / terminal helpers ───────────────────────────────────────────

  private replayPersisted(
    row: Prisma.PinExtractionSessionGetPayload<object>,
    subscriber: { next: (e: ExtractionEvent) => void },
  ): void {
    if (row.phase) {
      subscriber.next({
        type: 'status',
        data: { phase: row.phase as ExtractionPhase },
      });
    }
    const meta = this.coerceMetaJson(row.videoMeta);
    if (meta) subscriber.next({ type: 'video_meta', data: meta });
    for (const pin of this.coercePinsJson(row.pins)) {
      subscriber.next({ type: 'pin', data: pin });
    }
  }

  private emitTerminal(
    row: Prisma.PinExtractionSessionGetPayload<object>,
    subscriber: {
      next: (e: ExtractionEvent) => void;
    },
  ): void {
    if (row.status === PinExtractionStatus.DONE) {
      const pins = this.coercePinsJson(row.pins);
      subscriber.next({
        type: 'done',
        data: {
          sessionId: row.id,
          pinCount: pins.length,
          fromCache: row.fromCache,
        },
      });
      return;
    }
    if (row.status === PinExtractionStatus.FAILED) {
      subscriber.next({
        type: 'error',
        data: {
          code: row.errorCode ?? 'unknown',
          message: row.errorMessage ?? 'Extraction failed.',
        },
      });
      return;
    }
    if (row.status === PinExtractionStatus.CANCELLED) {
      subscriber.next({
        type: 'error',
        data: { code: 'cancelled', message: 'Extraction was cancelled.' },
      });
    }
  }

  private isTerminal(status: PinExtractionStatus): boolean {
    return (
      status === PinExtractionStatus.DONE ||
      status === PinExtractionStatus.FAILED ||
      status === PinExtractionStatus.CANCELLED
    );
  }

  // ── Run loop ────────────────────────────────────────────────────────────

  private async spawnRun(
    sessionId: string,
    subject: Subject<ExtractionEvent>,
    signal: AbortSignal,
  ): Promise<void> {
    const shortId = sessionId.slice(0, 8);
    this.logger.log(`[${shortId}] starting extraction`);

    let row: Prisma.PinExtractionSessionGetPayload<object> | null = null;
    const downloadedPaths: string[] = [];
    let terminalStatus: PinExtractionStatus = PinExtractionStatus.FAILED;
    let errorCode: string | undefined;
    let errorMessage: string | undefined;
    let collected: ExtractedPin[] = [];
    let meta: VideoMeta | undefined;
    let fromCache = false;
    // Tracks the furthest phase reached, surfaced as `failedPhase` on a FAILED
    // PIN_EXTRACTION_FINISHED so we can see *where* extractions break.
    let lastPhase: ExtractionPhase = 'queued';

    try {
      row = await this.prisma.pinExtractionSession.findUnique({
        where: { id: sessionId },
      });
      if (!row) {
        // Should never happen — startSession just created it.
        throw new Error(`Session row ${sessionId} disappeared before run`);
      }

      await this.updateStatus(sessionId, PinExtractionStatus.RUNNING, 'queued');
      this.safeEmit(subject, { type: 'status', data: { phase: 'queued' } });

      // --- Cache check --- (expired rows are treated as a MISS, forcing
      // real re-extraction even for the URL's original payer — see #194)
      const cached = await this.getValidCache(row.urlHash);
      if (cached) {
        const payload = this.coerceCachedPayload(cached.payload);
        if (payload.pins.length > 0) {
          this.logger.log(
            `[${shortId}] cache hit (${payload.pins.length} pins)`,
          );
          fromCache = true;
          meta = payload.meta;
          collected = payload.pins;

          lastPhase = 'cache_hit';
          await this.persistPhase(sessionId, 'cache_hit');
          this.safeEmit(subject, {
            type: 'status',
            data: { phase: 'cache_hit' },
          });

          if (meta) {
            await this.persistMeta(sessionId, meta);
            this.safeEmit(subject, { type: 'video_meta', data: meta });
          }

          const dtos: ExtractedPinDto[] = payload.pins.map((p, i) => ({
            index: i,
            ...p,
          }));
          for (const [index, dto] of dtos.entries()) {
            if (signal.aborted) break;
            await this.appendPin(sessionId, dto);
            this.safeEmit(subject, { type: 'pin', data: dto });
            if (index < dtos.length - 1) {
              await this.delay(CACHE_REPLAY_PIN_DELAY_MS, signal);
            }
          }

          if (signal.aborted) {
            terminalStatus = PinExtractionStatus.CANCELLED;
          } else {
            terminalStatus = PinExtractionStatus.DONE;
          }
          return;
        }
        this.logger.log(`[${shortId}] cache row had 0 pins — re-running`);
      }

      // --- Resolve (yt-dlp for videos, gallery-dl for TikTok photo posts) ---
      const isPhoto = this.resolver.isTikTokPhotoUrl(row.sourceUrl);
      lastPhase = 'resolving';
      await this.persistPhase(sessionId, 'resolving');
      this.safeEmit(subject, { type: 'status', data: { phase: 'resolving' } });

      const onPhase = async (phase: ExtractionPhase) => {
        lastPhase = phase;
        await this.persistPhase(sessionId, phase);
        this.safeEmit(subject, { type: 'status', data: { phase } });
      };

      let pinStream: AsyncGenerator<ExtractedPin>;
      if (isPhoto) {
        this.logger.log(`[${shortId}] resolving photo post via gallery-dl`);
        const downloaded = await this.resolver.downloadImages(
          row.sourceUrl,
          signal,
        );
        downloadedPaths.push(...downloaded.images.map((img) => img.tmpPath));
        this.logger.log(
          `[${shortId}] downloaded ${downloaded.images.length} image(s)`,
        );
        meta = {
          title: downloaded.title,
          description: downloaded.description,
          uploader: downloaded.uploader,
          thumbnail: downloaded.thumbnail,
        };
        pinStream = this.gemini.analyzeImagesStream(
          downloaded.images.map((img) => ({
            localPath: img.tmpPath,
            contentType: img.contentType,
          })),
          signal,
          onPhase,
        );
      } else {
        this.logger.log(`[${shortId}] resolving via yt-dlp`);
        const downloaded = await this.resolver.download(row.sourceUrl, signal);
        downloadedPaths.push(downloaded.tmpPath);
        this.logger.log(
          `[${shortId}] downloaded ${downloaded.tmpPath} (${downloaded.ext})`,
        );
        meta = {
          title: downloaded.title,
          description: downloaded.description,
          uploader: downloaded.uploader,
          thumbnail: downloaded.thumbnail,
        };
        pinStream = this.gemini.analyzeStream(
          downloaded.tmpPath,
          downloaded.contentType,
          signal,
          onPhase,
        );
      }

      if (meta.title || meta.description || meta.uploader || meta.thumbnail) {
        await this.persistMeta(sessionId, meta);
        this.safeEmit(subject, { type: 'video_meta', data: meta });
      }

      // --- Analyze ---
      this.logger.log(`[${shortId}] calling analysis provider`);
      let index = 0;
      for await (const pin of pinStream) {
        if (signal.aborted) break;
        const dto: ExtractedPinDto = { index, ...pin };
        index++;
        collected.push(pin);
        await this.appendPin(sessionId, dto);
        this.logger.log(`[${shortId}] yielded pin #${dto.index}: ${dto.name}`);
        this.safeEmit(subject, { type: 'pin', data: dto });
      }
      this.logger.log(
        `[${shortId}] analysis complete — ${collected.length} pins collected`,
      );

      // --- Persist cache (best effort, non-fatal) ---
      if (!signal.aborted && collected.length > 0) {
        const cachePayload: CachePayload = { pins: collected, meta };
        const expiresAt = this.newCacheExpiry();
        await this.prisma.pinExtractionCache
          .upsert({
            where: { urlHash: row.urlHash },
            create: {
              urlHash: row.urlHash,
              sourceUrl: row.sourceUrl,
              payload: cachePayload as unknown as object,
              expiresAt,
            },
            update: {
              sourceUrl: row.sourceUrl,
              payload: cachePayload as unknown as object,
              expiresAt,
            },
          })
          .catch((err) =>
            this.logger.warn(
              `[${shortId}] cache upsert failed: ${(err as Error).message}`,
            ),
          );
      }

      terminalStatus = signal.aborted
        ? PinExtractionStatus.CANCELLED
        : PinExtractionStatus.DONE;
    } catch (err) {
      if (signal.aborted) {
        terminalStatus = PinExtractionStatus.CANCELLED;
      } else {
        terminalStatus = PinExtractionStatus.FAILED;
        if (err instanceof VideoResolverError) {
          errorCode = err.code;
          errorMessage = err.message;
        } else {
          errorCode = 'unknown';
          errorMessage = (err as Error).message;
        }
        this.logger.error(`[${shortId}] failed: ${errorMessage}`);
      }
    } finally {
      // 1. DB terminal write
      await this.finalizeSession(
        sessionId,
        terminalStatus,
        errorCode,
        errorMessage,
        fromCache,
      ).catch((err) =>
        this.logger.error(
          `[${shortId}] finalize failed: ${(err as Error).message}`,
        ),
      );

      // 1a. Terminal analytics — one event with an `outcome` discriminator
      // (mirrors SCAN_PACK_REFUNDED). Wrapped so a malformed `row` can NEVER
      // throw and skip the credit refund below. `row` may be null if the
      // initial findUnique failed, so guard everything derived from it.
      try {
        const outcome =
          terminalStatus === PinExtractionStatus.DONE
            ? 'done'
            : terminalStatus === PinExtractionStatus.CANCELLED
              ? 'cancelled'
              : 'failed';
        void this.analytics.track(AnalyticsEventName.PIN_EXTRACTION_FINISHED, {
          userId: row?.userId ?? null,
          properties: {
            sessionId,
            platform: row ? this.platformOf(row.sourceUrl) : null,
            mediaType: row
              ? this.resolver.isTikTokPhotoUrl(row.sourceUrl)
                ? 'photo'
                : 'video'
              : null,
            outcome,
            pinCount: collected.length,
            fromCache,
            errorCode: errorCode ?? null,
            failedPhase: outcome === 'failed' ? lastPhase : null,
            durationMs: row?.createdAt
              ? Date.now() - row.createdAt.getTime()
              : null,
          },
        });
      } catch (err) {
        this.logger.warn(
          `[${shortId}] terminal analytics failed: ${(err as Error).message}`,
        );
      }

      // first_scan mission — successful extractions only (cache hits count:
      // the user still got their pins). Handles a null userId internally.
      if (terminalStatus === PinExtractionStatus.DONE) {
        void this.missions.onScanFinished(row?.userId);
      }

      // 1b. Refund the consumed credit when appropriate. FAILED/CANCELLED
      // always refunds. DONE+fromCache no longer refunds unconditionally —
      // under the per-user billing rule (#194) a cache hit is NOT free by
      // itself, so a charge that lands here is usually the legitimate first
      // payment for this (user, url) pair and must stand. The one remaining
      // case: this session raced startSession's "already paid" check against
      // ANOTHER session of the SAME user for the SAME urlHash (both saw "not
      // paid yet" before either committed) and both got charged. If, by now,
      // the user has a different standing (non-refunded) payment for this
      // url, this charge is the duplicate — refund it. refund() is idempotent
      // and a no-op for sessions that never consumed (pre-existing paid hit).
      if (
        terminalStatus === PinExtractionStatus.FAILED ||
        terminalStatus === PinExtractionStatus.CANCELLED
      ) {
        await this.scanCredit.refund(sessionId);
      } else if (
        terminalStatus === PinExtractionStatus.DONE &&
        fromCache &&
        row &&
        (await this.hasUserPaidForUrl(row.userId, row.urlHash, sessionId))
      ) {
        await this.scanCredit.refund(sessionId);
      }

      // 2. Terminal SSE event for subscribers
      try {
        if (terminalStatus === PinExtractionStatus.DONE) {
          this.safeEmit(subject, {
            type: 'done',
            data: {
              sessionId,
              pinCount: collected.length,
              fromCache,
            },
          });
        } else if (terminalStatus === PinExtractionStatus.FAILED) {
          this.safeEmit(subject, {
            type: 'error',
            data: {
              code: errorCode ?? 'unknown',
              message: errorMessage ?? 'Extraction failed.',
            },
          });
        } else if (terminalStatus === PinExtractionStatus.CANCELLED) {
          this.safeEmit(subject, {
            type: 'error',
            data: { code: 'cancelled', message: 'Extraction was cancelled.' },
          });
        }
        subject.complete();
      } catch (err) {
        this.logger.warn(
          `[${shortId}] terminal emit failed: ${(err as Error).message}`,
        );
      }

      // 3. Live-registry cleanup
      this.liveSessions.delete(sessionId);

      // 4. Local file cleanup
      for (const path of downloadedPaths) {
        await this.resolver.cleanup(path);
      }

      // 5. APN push for terminal DONE/FAILED. We always fire — the client
      // decides whether to actually show the banner (NotificationDelegate's
      // willPresent suppresses when the user is literally inside
      // ProcessPinView for this session). Trying to suppress server-side
      // is unreliable: a backgrounded iOS app keeps the SSE socket open
      // for a while after backgrounding, so `subject.observed` returns
      // true even though the user isn't actually watching.
      if (
        row &&
        (terminalStatus === PinExtractionStatus.DONE ||
          terminalStatus === PinExtractionStatus.FAILED)
      ) {
        await this.notifications
          .sendPinExtractionCompletedPush(row.userId, sessionId, {
            status: terminalStatus,
            pinCount: collected.length,
            videoTitle: meta?.title ?? meta?.description,
          })
          .catch((err) =>
            this.logger.warn(
              `[${shortId}] APN push failed: ${(err as Error).message}`,
            ),
          );
      }
    }
  }

  // ── DB writes ───────────────────────────────────────────────────────────

  private async updateStatus(
    sessionId: string,
    status: PinExtractionStatus,
    phase?: ExtractionPhase,
  ): Promise<void> {
    await this.prisma.pinExtractionSession.update({
      where: { id: sessionId },
      data: { status, ...(phase ? { phase } : {}) },
    });
  }

  private async persistPhase(
    sessionId: string,
    phase: ExtractionPhase,
  ): Promise<void> {
    await this.prisma.pinExtractionSession.update({
      where: { id: sessionId },
      data: { phase },
    });
  }

  private async persistMeta(sessionId: string, meta: VideoMeta): Promise<void> {
    await this.prisma.pinExtractionSession.update({
      where: { id: sessionId },
      data: { videoMeta: meta as unknown as Prisma.InputJsonValue },
    });
  }

  // Append a pin to the JSON column. We read-modify-write each time; pins
  // are <200B each and videos top out around 30 pins, so the cost is
  // negligible and avoids introducing a child table for this iteration.
  private async appendPin(
    sessionId: string,
    pin: ExtractedPinDto,
  ): Promise<void> {
    const row = await this.prisma.pinExtractionSession.findUnique({
      where: { id: sessionId },
      select: { pins: true },
    });
    if (!row) return;
    const current = this.coercePinsJson(row.pins);
    current.push(pin);
    await this.prisma.pinExtractionSession.update({
      where: { id: sessionId },
      data: { pins: current as unknown as Prisma.InputJsonValue },
    });
  }

  private async finalizeSession(
    sessionId: string,
    status: PinExtractionStatus,
    errorCode: string | undefined,
    errorMessage: string | undefined,
    fromCache: boolean,
  ): Promise<void> {
    await this.prisma.pinExtractionSession.update({
      where: { id: sessionId },
      data: {
        status,
        errorCode: errorCode ?? null,
        errorMessage: errorMessage ?? null,
        fromCache,
        completedAt: new Date(),
      },
    });
  }

  // ── Cleanup cron ────────────────────────────────────────────────────────

  // Reconcile orphaned RUNNING/QUEUED rows that lost their live Subject —
  // typically because the server crashed or was restarted mid-extraction.
  // Staleness predicate (updatedAt < now - 10min) ensures we don't poison
  // healthy sessions that haven't ticked recently.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanupStaleSessions(): Promise<void> {
    const cutoff = new Date(Date.now() - STALENESS_MS);
    const liveIds = Array.from(this.liveSessions.keys());

    // Find orphans first so we can refund their consumed credits alongside
    // the bulk status flip. Without this loop, server-crash orphans would
    // permanently consume a credit for the affected users.
    const orphans = await this.prisma.pinExtractionSession.findMany({
      where: {
        status: {
          in: [PinExtractionStatus.QUEUED, PinExtractionStatus.RUNNING],
        },
        updatedAt: { lt: cutoff },
        id: { notIn: liveIds.length > 0 ? liveIds : undefined },
      },
      select: { id: true, userId: true, sourceUrl: true },
    });

    if (orphans.length === 0) return;

    const orphanIds = orphans.map((o) => o.id);
    await this.prisma.pinExtractionSession.updateMany({
      where: { id: { in: orphanIds } },
      data: {
        status: PinExtractionStatus.FAILED,
        errorCode: 'orphaned',
        errorMessage: 'Extraction was interrupted.',
        completedAt: new Date(),
      },
    });

    for (const orphan of orphans) {
      await this.scanCredit.refund(orphan.id);
      // Mirror the spawnRun terminal event for crash-orphaned sessions.
      // durationMs is omitted: createdAt is stale (≥ STALENESS_MS old) and
      // would not reflect real extraction time. Dashboards filtering genuine
      // failures should exclude errorCode='orphaned'.
      void this.analytics.track(AnalyticsEventName.PIN_EXTRACTION_FINISHED, {
        userId: orphan.userId,
        properties: {
          sessionId: orphan.id,
          platform: this.platformOf(orphan.sourceUrl),
          outcome: 'failed',
          errorCode: 'orphaned',
          failedPhase: null,
        },
      });
    }

    this.logger.log(
      `cleanupStaleSessions marked ${orphanIds.length} orphan(s) as FAILED`,
    );
  }

  // Deletes cache rows past their TTL. `payload` is JSON and can be large
  // (up to ~30 pins per video), so expired rows aren't just dead weight for
  // billing purposes — they're worth reclaiming from storage too.
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async cleanupExpiredCache(): Promise<void> {
    const { count } = await this.prisma.pinExtractionCache.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    if (count > 0) {
      this.logger.log(`cleanupExpiredCache deleted ${count} expired row(s)`);
    }
  }

  // ── Cache billing (#194) ────────────────────────────────────────────────

  // Reads the cache row for urlHash, returning null when missing OR past its
  // TTL. Expired rows are treated identically to "no cache" by every caller
  // — they don't count toward "already paid" and they don't let spawnRun
  // skip re-extraction.
  private async getValidCache(
    urlHash: string,
  ): Promise<Prisma.PinExtractionCacheGetPayload<object> | null> {
    const row = await this.prisma.pinExtractionCache.findUnique({
      where: { urlHash },
    });
    if (!row || row.expiresAt <= new Date()) return null;
    return row;
  }

  private newCacheExpiry(): Date {
    return new Date(Date.now() + this.cacheTtlMs);
  }

  // "Paid" = userId has a PinExtractionSession for this urlHash whose credit
  // consumption is still standing (never refunded). A session that FAILED or
  // was CANCELLED gets refunded by spawnRun's finally block, so it correctly
  // falls out of this check — that user must be charged again on retry.
  // excludeSessionId lets the finally-block race-refund check ask "did the
  // user already pay via a DIFFERENT session", excluding the one currently
  // finishing.
  private async hasUserPaidForUrl(
    userId: number,
    urlHash: string,
    excludeSessionId?: string,
  ): Promise<boolean> {
    const sessions = await this.prisma.pinExtractionSession.findMany({
      where: {
        userId,
        urlHash,
        ...(excludeSessionId ? { id: { not: excludeSessionId } } : {}),
      },
      select: { id: true },
    });
    if (sessions.length === 0) return false;
    const paid = await this.prisma.scanCreditConsumption.findFirst({
      where: {
        sessionId: { in: sessions.map((s) => s.id) },
        refundedAt: null,
      },
      select: { id: true },
    });
    return !!paid;
  }

  // ── Utilities ───────────────────────────────────────────────────────────

  // Safely emit on a subject that may have already been completed by an
  // earlier abort. RxJS subjects throw if you call next after complete; the
  // try/catch is cheap and lets the finally block keep going.
  private safeEmit(
    subject: Subject<ExtractionEvent>,
    event: ExtractionEvent,
  ): void {
    if (subject.closed) return;
    try {
      subject.next(event);
    } catch (err) {
      this.logger.warn(`safeEmit dropped event: ${(err as Error).message}`);
    }
  }

  private coerceCachedPayload(payload: unknown): {
    pins: ExtractedPin[];
    meta?: VideoMeta;
  } {
    const isPin = (p: unknown): p is ExtractedPin =>
      typeof p === 'object' &&
      p !== null &&
      typeof (p as { name?: unknown }).name === 'string';

    // Legacy shape — payload was a bare array of pins.
    if (Array.isArray(payload)) {
      return { pins: payload.filter(isPin) };
    }
    if (
      typeof payload === 'object' &&
      payload !== null &&
      Array.isArray((payload as CachePayload).pins)
    ) {
      const obj = payload as CachePayload;
      return {
        pins: obj.pins.filter(isPin),
        meta:
          obj.meta &&
          (obj.meta.title ||
            obj.meta.description ||
            obj.meta.uploader ||
            obj.meta.thumbnail)
            ? obj.meta
            : undefined,
      };
    }
    return { pins: [] };
  }

  private coercePinsJson(value: unknown): ExtractedPinDto[] {
    if (!Array.isArray(value)) return [];
    return value.filter(
      (p): p is ExtractedPinDto =>
        typeof p === 'object' &&
        p !== null &&
        typeof (p as { name?: unknown }).name === 'string',
    );
  }

  private coerceMetaJson(value: unknown): VideoMeta | null {
    if (typeof value !== 'object' || value === null) return null;
    const obj = value as VideoMeta;
    if (obj.title || obj.description || obj.uploader || obj.thumbnail) {
      return obj;
    }
    return null;
  }

  private async delay(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return;
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(resolve, ms);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
    });
  }
}

// Helper used by the SSE controller to map an ExtractionEvent to a Nest
// MessageEvent. Defined here so both controllers and tests can import it.
export function toMessageEvent(event: ExtractionEvent): {
  type: string;
  data: ExtractionEvent['data'];
} {
  return { type: event.type, data: event.data };
}

// Re-exported so tests can build a Subject<ExtractionEvent> directly.
export type ExtractionSubject = Subject<ExtractionEvent>;
