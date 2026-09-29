import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinExtractionStatus } from '@prisma/client';
import { firstValueFrom, toArray } from 'rxjs';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import type { GeminiService } from '../common/gemini/gemini.service';
import { PinExtractionService } from './pin-extraction.service';
import { InsufficientScanCreditsException } from '../scan-credit/insufficient-scan-credits.exception';
import { ScanCreditService } from '../scan-credit/scan-credit.service';
import { AnalyticsService } from '../analytics/analytics.service';
import { VideoResolverService } from './video-resolver.service';

describe('PinExtractionService', () => {
  let pinExtractionSession: {
    findFirst: jest.Mock;
    findUnique: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    delete: jest.Mock;
  };
  let pinExtractionCache: {
    findUnique: jest.Mock;
    upsert: jest.Mock;
    deleteMany: jest.Mock;
  };
  let scanCreditConsumption: { findFirst: jest.Mock };
  let resolver: jest.Mocked<
    Pick<
      VideoResolverService,
      | 'canonicalizeSourceUrl'
      | 'download'
      | 'downloadImages'
      | 'isTikTokPhotoUrl'
      | 'cleanup'
    >
  >;
  let provider: { analyzeStream: jest.Mock; analyzeImagesStream: jest.Mock };
  let notifications: jest.Mocked<
    Pick<NotificationsService, 'sendPinExtractionCompletedPush'>
  >;
  let scanCredit: {
    getBalance: jest.Mock;
    consume: jest.Mock;
    refund: jest.Mock;
    reconcileProGrants: jest.Mock;
    grantPurchase: jest.Mock;
  };
  let analytics: { track: jest.Mock };
  let config: { get: jest.Mock };
  let service: PinExtractionService;

  const USER_ID = 42;
  const TTL_DAYS = 7;
  const notExpired = () =>
    new Date(Date.now() + TTL_DAYS * 24 * 60 * 60 * 1000);
  const expired = () => new Date(Date.now() - 60 * 1000);

  beforeEach(() => {
    pinExtractionSession = {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue({}),
    };
    pinExtractionCache = {
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    };
    scanCreditConsumption = {
      findFirst: jest.fn().mockResolvedValue(null),
    };
    const prisma = {
      pinExtractionSession,
      pinExtractionCache,
      scanCreditConsumption,
    } as unknown as PrismaService;

    resolver = {
      canonicalizeSourceUrl: jest.fn(),
      download: jest.fn(),
      downloadImages: jest.fn(),
      isTikTokPhotoUrl: jest.fn().mockReturnValue(false),
      cleanup: jest.fn().mockResolvedValue(undefined),
    };
    // analyzeStream is an async generator. Default to "no pins, no phases."
    provider = {
      analyzeStream: jest.fn().mockImplementation(async function* () {
        // empty
      }),
      analyzeImagesStream: jest.fn().mockImplementation(async function* () {
        // empty
      }),
    };
    notifications = {
      sendPinExtractionCompletedPush: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<
      Pick<NotificationsService, 'sendPinExtractionCompletedPush'>
    >;
    scanCredit = {
      getBalance: jest
        .fn()
        .mockResolvedValue({ available: 1, nextProGrantAt: null }),
      consume: jest
        .fn()
        .mockResolvedValue({ available: 0, nextProGrantAt: null }),
      refund: jest.fn().mockResolvedValue(undefined),
      reconcileProGrants: jest.fn().mockResolvedValue(undefined),
      grantPurchase: jest.fn().mockResolvedValue(undefined),
    };

    analytics = { track: jest.fn().mockResolvedValue(undefined) };

    config = { get: jest.fn().mockReturnValue(TTL_DAYS) };

    service = new PinExtractionService(
      prisma,
      resolver as unknown as VideoResolverService,
      provider as unknown as GeminiService,
      notifications as unknown as NotificationsService,
      scanCredit as unknown as ScanCreditService,
      analytics as unknown as AnalyticsService,
      config as unknown as ConfigService,
      { onScanFinished: jest.fn() } as any,
    );
  });

  describe('startSession', () => {
    it('creates a new session row for a fresh URL and returns its id', async () => {
      resolver.canonicalizeSourceUrl.mockResolvedValueOnce(
        'https://www.instagram.com/reel/ABC',
      );
      pinExtractionSession.findFirst.mockResolvedValue(null); // no existing
      pinExtractionSession.create.mockResolvedValue({
        id: 'sess_123',
        userId: USER_ID,
        sourceUrl: 'https://www.instagram.com/reel/ABC',
        urlHash: 'abc',
        status: PinExtractionStatus.QUEUED,
      });
      pinExtractionSession.findUnique.mockResolvedValue({
        id: 'sess_123',
        userId: USER_ID,
        sourceUrl: 'https://www.instagram.com/reel/ABC',
        urlHash: 'abc',
        status: PinExtractionStatus.QUEUED,
        pins: [],
      });
      // Stop the spawnRun loop from doing any real work.
      resolver.download.mockRejectedValue(new Error('download stubbed off'));

      const result = await service.startSession(
        'https://instagram.com/p/ABC',
        USER_ID,
      );
      expect(result.sessionId).toBe('sess_123');
      expect(pinExtractionSession.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: USER_ID,
            status: PinExtractionStatus.QUEUED,
          }),
        }),
      );
    });

    it('returns the existing session id when same user re-pastes the same URL', async () => {
      resolver.canonicalizeSourceUrl.mockResolvedValueOnce(
        'https://www.tiktok.com/@u/video/1',
      );
      pinExtractionSession.findFirst.mockResolvedValueOnce({
        id: 'sess_existing',
        userId: USER_ID,
        urlHash: 'whatever',
        status: PinExtractionStatus.RUNNING,
      });

      const result = await service.startSession(
        'https://www.tiktok.com/@u/video/1',
        USER_ID,
      );
      expect(result.sessionId).toBe('sess_existing');
      expect(pinExtractionSession.create).not.toHaveBeenCalled();
    });

    it('throws ConflictException when user has a different URL running', async () => {
      resolver.canonicalizeSourceUrl.mockResolvedValueOnce(
        'https://www.tiktok.com/@u/video/2',
      );
      pinExtractionSession.findFirst
        // No same-URL session.
        .mockResolvedValueOnce(null)
        // But a different URL is running.
        .mockResolvedValueOnce({
          id: 'sess_running',
          urlHash: 'other',
          status: PinExtractionStatus.RUNNING,
        });

      await expect(
        service.startSession('https://www.tiktok.com/@u/video/2', USER_ID),
      ).rejects.toThrow(ConflictException);
    });

    it('consumes a credit for a fresh non-cached URL', async () => {
      resolver.canonicalizeSourceUrl.mockResolvedValueOnce(
        'https://www.instagram.com/reel/FRESH',
      );
      pinExtractionSession.findFirst.mockResolvedValue(null);
      pinExtractionCache.findUnique.mockResolvedValueOnce(null);
      pinExtractionSession.create.mockResolvedValue({
        id: 'sess_fresh',
        userId: USER_ID,
        sourceUrl: 'https://www.instagram.com/reel/FRESH',
        urlHash: 'fresh',
        status: PinExtractionStatus.QUEUED,
      });
      pinExtractionSession.findUnique.mockResolvedValue({
        id: 'sess_fresh',
        userId: USER_ID,
        urlHash: 'fresh',
        status: PinExtractionStatus.QUEUED,
        pins: [],
      });
      resolver.download.mockRejectedValue(new Error('stop run'));

      await service.startSession('https://instagram.com/reel/FRESH', USER_ID);

      expect(scanCredit.consume).toHaveBeenCalledWith(USER_ID, 'sess_fresh');
    });

    // #194: a cache hit alone must never be free — only THIS user having
    // already paid for THIS url (within the TTL) exempts them from a charge.
    it('charges a user who scans an already-cached URL they have never paid for', async () => {
      resolver.canonicalizeSourceUrl.mockResolvedValueOnce(
        'https://www.instagram.com/reel/CACHED',
      );
      pinExtractionSession.findFirst.mockResolvedValue(null);
      pinExtractionCache.findUnique.mockResolvedValueOnce({
        id: 7,
        expiresAt: notExpired(),
      });
      // This user has no prior sessions for this urlHash at all.
      pinExtractionSession.findMany.mockResolvedValueOnce([]);
      pinExtractionSession.create.mockResolvedValue({
        id: 'sess_cached_unpaid',
        userId: USER_ID,
        urlHash: 'cached',
        status: PinExtractionStatus.QUEUED,
      });
      pinExtractionSession.findUnique.mockResolvedValue({
        id: 'sess_cached_unpaid',
        userId: USER_ID,
        urlHash: 'cached',
        status: PinExtractionStatus.QUEUED,
        pins: [],
      });
      resolver.download.mockRejectedValue(new Error('stop run'));

      await service.startSession('https://instagram.com/reel/CACHED', USER_ID);

      expect(scanCredit.consume).toHaveBeenCalledWith(
        USER_ID,
        'sess_cached_unpaid',
      );
    });

    it('does not charge when this user already paid for this URL within the TTL', async () => {
      resolver.canonicalizeSourceUrl.mockResolvedValueOnce(
        'https://www.instagram.com/reel/REPAID',
      );
      // Session was dismissed, so the "same user re-paste" shortcut doesn't
      // apply and we fall through to the cache + paid-history check.
      pinExtractionSession.findFirst.mockResolvedValue(null);
      pinExtractionCache.findUnique.mockResolvedValueOnce({
        id: 8,
        expiresAt: notExpired(),
      });
      pinExtractionSession.findMany.mockResolvedValueOnce([
        { id: 'sess_prior_paid' },
      ]);
      scanCreditConsumption.findFirst.mockResolvedValueOnce({ id: 1 });
      pinExtractionSession.create.mockResolvedValue({
        id: 'sess_repaid',
        userId: USER_ID,
        urlHash: 'repaid',
        status: PinExtractionStatus.QUEUED,
      });
      pinExtractionSession.findUnique.mockResolvedValue({
        id: 'sess_repaid',
        userId: USER_ID,
        urlHash: 'repaid',
        status: PinExtractionStatus.QUEUED,
        pins: [],
      });
      resolver.download.mockRejectedValue(new Error('stop run'));

      await service.startSession('https://instagram.com/reel/REPAID', USER_ID);

      expect(scanCredit.consume).not.toHaveBeenCalled();
    });

    it('charges even the original payer once the cache row has passed its TTL', async () => {
      resolver.canonicalizeSourceUrl.mockResolvedValueOnce(
        'https://www.instagram.com/reel/STALE',
      );
      pinExtractionSession.findFirst.mockResolvedValue(null);
      pinExtractionCache.findUnique.mockResolvedValueOnce({
        id: 9,
        expiresAt: expired(),
      });
      pinExtractionSession.create.mockResolvedValue({
        id: 'sess_stale',
        userId: USER_ID,
        urlHash: 'stale',
        status: PinExtractionStatus.QUEUED,
      });
      pinExtractionSession.findUnique.mockResolvedValue({
        id: 'sess_stale',
        userId: USER_ID,
        urlHash: 'stale',
        status: PinExtractionStatus.QUEUED,
        pins: [],
      });
      resolver.download.mockRejectedValue(new Error('stop run'));

      await service.startSession('https://instagram.com/reel/STALE', USER_ID);

      expect(scanCredit.consume).toHaveBeenCalledWith(USER_ID, 'sess_stale');
      // Expired ⇒ treated as no cache at all, so the paid-history lookup is
      // never even needed to decide the charge.
      expect(pinExtractionSession.findMany).not.toHaveBeenCalled();
    });

    it('charges again on retry when the prior session for this URL was refunded', async () => {
      resolver.canonicalizeSourceUrl.mockResolvedValueOnce(
        'https://www.instagram.com/reel/RETRY',
      );
      pinExtractionSession.findFirst.mockResolvedValue(null);
      pinExtractionCache.findUnique.mockResolvedValueOnce({
        id: 10,
        expiresAt: notExpired(),
      });
      pinExtractionSession.findMany.mockResolvedValueOnce([
        { id: 'sess_failed_refunded' },
      ]);
      // The prior consumption was refunded (FAILED session) — not "paid".
      scanCreditConsumption.findFirst.mockResolvedValueOnce(null);
      pinExtractionSession.create.mockResolvedValue({
        id: 'sess_retry',
        userId: USER_ID,
        urlHash: 'retry',
        status: PinExtractionStatus.QUEUED,
      });
      pinExtractionSession.findUnique.mockResolvedValue({
        id: 'sess_retry',
        userId: USER_ID,
        urlHash: 'retry',
        status: PinExtractionStatus.QUEUED,
        pins: [],
      });
      resolver.download.mockRejectedValue(new Error('stop run'));

      await service.startSession('https://instagram.com/reel/RETRY', USER_ID);

      expect(scanCredit.consume).toHaveBeenCalledWith(USER_ID, 'sess_retry');
    });

    it('rolls back the session row and rethrows when out of credits', async () => {
      resolver.canonicalizeSourceUrl.mockResolvedValueOnce(
        'https://www.instagram.com/reel/OVER',
      );
      pinExtractionSession.findFirst.mockResolvedValue(null);
      pinExtractionCache.findUnique.mockResolvedValueOnce(null);
      pinExtractionSession.create.mockResolvedValue({
        id: 'sess_over',
        userId: USER_ID,
        urlHash: 'over',
        status: PinExtractionStatus.QUEUED,
      });
      scanCredit.consume.mockRejectedValueOnce(
        new InsufficientScanCreditsException({
          available: 0,
          nextProGrantAt: null,
          canPurchase: true,
        }),
      );

      await expect(
        service.startSession('https://instagram.com/reel/OVER', USER_ID),
      ).rejects.toThrow(InsufficientScanCreditsException);

      expect(pinExtractionSession.delete).toHaveBeenCalledWith({
        where: { id: 'sess_over' },
      });
    });
  });

  describe('spawnRun — TikTok photo posts', () => {
    // spawnRun is fire-and-forget from startSession; drain the microtask
    // queue until its finally block has run (finalize update observed).
    const flush = async () => {
      for (let i = 0; i < 50; i++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    };

    const PHOTO_URL = 'https://www.tiktok.com/@user/photo/123';

    const startPhotoSession = async () => {
      resolver.canonicalizeSourceUrl.mockResolvedValueOnce(PHOTO_URL);
      resolver.isTikTokPhotoUrl.mockReturnValue(true);
      pinExtractionSession.findFirst.mockResolvedValue(null);
      pinExtractionSession.create.mockResolvedValue({
        id: 'sess_photo',
        userId: USER_ID,
        sourceUrl: PHOTO_URL,
        urlHash: 'photohash',
        status: PinExtractionStatus.QUEUED,
        createdAt: new Date(),
      });
      pinExtractionSession.findUnique.mockResolvedValue({
        id: 'sess_photo',
        userId: USER_ID,
        sourceUrl: PHOTO_URL,
        urlHash: 'photohash',
        status: PinExtractionStatus.QUEUED,
        pins: [],
        createdAt: new Date(),
      });
      await service.startSession(PHOTO_URL, USER_ID);
      await flush();
    };

    it('routes photo URLs through downloadImages + analyzeImagesStream and cleans up every tmp file', async () => {
      resolver.downloadImages.mockResolvedValue({
        images: [
          { tmpPath: '/tmp/pin-a-0.jpeg', contentType: 'image/jpeg' },
          { tmpPath: '/tmp/pin-a-1.jpeg', contentType: 'image/jpeg' },
        ],
        title: 'Da Nang trip',
        uploader: 'Ello XinK',
        thumbnail: 'https://cdn.example/img0.jpeg',
      });
      provider.analyzeImagesStream.mockImplementation(async function* () {
        await Promise.resolve();
        yield { name: 'Bánh mì Bà Lan', sourceTimestampSec: 1 };
      });

      await startPhotoSession();

      expect(resolver.download).not.toHaveBeenCalled();
      expect(provider.analyzeStream).not.toHaveBeenCalled();
      expect(resolver.downloadImages).toHaveBeenCalledWith(
        PHOTO_URL,
        expect.anything(),
      );
      expect(provider.analyzeImagesStream).toHaveBeenCalledWith(
        [
          { localPath: '/tmp/pin-a-0.jpeg', contentType: 'image/jpeg' },
          { localPath: '/tmp/pin-a-1.jpeg', contentType: 'image/jpeg' },
        ],
        expect.anything(),
        expect.any(Function),
      );
      // video_meta persisted from gallery-dl metadata.
      expect(pinExtractionSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            videoMeta: expect.objectContaining({ title: 'Da Nang trip' }),
          }),
        }),
      );
      // Terminal DONE + both tmp files cleaned.
      expect(pinExtractionSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PinExtractionStatus.DONE }),
        }),
      );
      expect(resolver.cleanup).toHaveBeenCalledWith('/tmp/pin-a-0.jpeg');
      expect(resolver.cleanup).toHaveBeenCalledWith('/tmp/pin-a-1.jpeg');
    });

    it('refunds the credit when the photo download fails', async () => {
      resolver.downloadImages.mockRejectedValue(new Error('gallery-dl broke'));

      await startPhotoSession();

      expect(pinExtractionSession.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: PinExtractionStatus.FAILED }),
        }),
      );
      expect(scanCredit.refund).toHaveBeenCalledWith('sess_photo');
    });
  });

  describe('spawnRun — cache billing race refund (#194)', () => {
    // spawnRun is fire-and-forget from startSession; drain the microtask
    // queue until its finally block has run (finalize update observed).
    const flush = async () => {
      for (let i = 0; i < 50; i++) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    };

    const RACE_URL = 'https://www.tiktok.com/@user/video/race';
    const URL_HASH = 'racehash';

    // Simulates: this session found no cache at startSession time (so it got
    // charged), but by the time spawnRun checks, a concurrent request for
    // the same URL has populated the cache — this session serves from cache
    // without calling Gemini (fromCache = true, DONE).
    const startRaceSession = async (sessionId: string) => {
      resolver.canonicalizeSourceUrl.mockResolvedValueOnce(RACE_URL);
      resolver.isTikTokPhotoUrl.mockReturnValue(false);
      pinExtractionSession.findFirst.mockResolvedValue(null);
      pinExtractionCache.findUnique.mockResolvedValueOnce(null); // startSession precheck: no cache yet
      pinExtractionSession.create.mockResolvedValue({
        id: sessionId,
        userId: USER_ID,
        sourceUrl: RACE_URL,
        urlHash: URL_HASH,
        status: PinExtractionStatus.QUEUED,
        createdAt: new Date(),
      });
      pinExtractionSession.findUnique.mockResolvedValue({
        id: sessionId,
        userId: USER_ID,
        sourceUrl: RACE_URL,
        urlHash: URL_HASH,
        status: PinExtractionStatus.QUEUED,
        pins: [],
        createdAt: new Date(),
      });
      pinExtractionCache.findUnique.mockResolvedValueOnce({
        id: 99,
        payload: { pins: [{ name: 'Race pin' }] },
        expiresAt: notExpired(),
      });
      await service.startSession(RACE_URL, USER_ID);
      await flush();
    };

    it('refunds the charge when, by completion, the user already has a different standing payment for this URL', async () => {
      // hasUserPaidForUrl(userId, urlHash, exclude=thisSession) finds a
      // sibling session with a non-refunded consumption — this session's own
      // charge is the duplicate produced by the startSession-time race.
      pinExtractionSession.findMany.mockResolvedValueOnce([
        { id: 'sess_sibling_paid' },
      ]);
      scanCreditConsumption.findFirst.mockResolvedValueOnce({ id: 5 });

      await startRaceSession('sess_race_dup');

      expect(scanCredit.consume).toHaveBeenCalledWith(USER_ID, 'sess_race_dup');
      expect(scanCredit.refund).toHaveBeenCalledWith('sess_race_dup');
    });

    it('does NOT refund a legitimate new charge that happens to land on a freshly-populated cache', async () => {
      // No sibling session exists — this is the user's only/first payment
      // for this URL, so it must stand even though it served from cache.
      pinExtractionSession.findMany.mockResolvedValueOnce([]);

      await startRaceSession('sess_race_solo');

      expect(scanCredit.consume).toHaveBeenCalledWith(
        USER_ID,
        'sess_race_solo',
      );
      expect(scanCredit.refund).not.toHaveBeenCalled();
    });
  });

  describe('stream — unknown session', () => {
    it('emits an error event when the row is missing', async () => {
      pinExtractionSession.findUnique.mockResolvedValue(null);

      const events = await firstValueFrom(
        service.stream('not-a-real-session', USER_ID).pipe(toArray()),
      );
      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as { code: string }).code).toBe(
        'unknown_session',
      );
    });

    it('rejects access for a different user', async () => {
      pinExtractionSession.findUnique.mockResolvedValue({
        id: 'sess_mine',
        userId: 99,
        status: PinExtractionStatus.RUNNING,
        pins: [],
      });

      const events = await firstValueFrom(
        service.stream('sess_mine', USER_ID).pipe(toArray()),
      );
      const errorEvent = events.find((e) => e.type === 'error');
      expect(errorEvent).toBeDefined();
      expect((errorEvent!.data as { code: string }).code).toBe(
        'unknown_session',
      );
    });
  });

  describe('stream — terminal session replay', () => {
    it('replays persisted pins and emits done for a DONE session', async () => {
      pinExtractionSession.findUnique.mockResolvedValue({
        id: 'sess_done',
        userId: USER_ID,
        status: PinExtractionStatus.DONE,
        phase: 'analyzing',
        videoMeta: null,
        pins: [
          { index: 0, name: 'A' },
          { index: 1, name: 'B' },
        ],
        fromCache: false,
      });

      const events = await firstValueFrom(
        service.stream('sess_done', USER_ID).pipe(toArray()),
      );

      const pinEvents = events.filter((e) => e.type === 'pin');
      expect(pinEvents).toHaveLength(2);
      const last = events[events.length - 1];
      expect(last.type).toBe('done');
      expect(
        (last.data as { fromCache: boolean; pinCount: number }).fromCache,
      ).toBe(false);
    });
  });
});
