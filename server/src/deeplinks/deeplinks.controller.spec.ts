import { Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FriendsService } from '../friends/friends.service';
import { MarketplaceService } from '../marketplace/marketplace.service';
import { TripsService } from '../trips/trips.service';
import { DeeplinksController } from './deeplinks.controller';

function makeConfig(values: Record<string, string | undefined>): ConfigService {
  return {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'GCS_PUBLIC_BUCKET') return 'oneplan-public';
      throw new Error(`unexpected key: ${key}`);
    }),
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService;
}

describe('DeeplinksController', () => {
  let controller: DeeplinksController;
  let tripsService: Pick<TripsService, 'getInvitePreview'>;
  let friendsService: Pick<FriendsService, 'getPublicPreviewByCode'>;
  let marketplaceService: Pick<MarketplaceService, 'getPublicListingPreview'>;

  function makeController(
    values: Record<string, string | undefined>,
  ): DeeplinksController {
    return new DeeplinksController(
      tripsService as unknown as TripsService,
      friendsService as unknown as FriendsService,
      marketplaceService as unknown as MarketplaceService,
      makeConfig(values),
    );
  }

  beforeEach(() => {
    tripsService = { getInvitePreview: jest.fn() };
    friendsService = { getPublicPreviewByCode: jest.fn() };
    marketplaceService = { getPublicListingPreview: jest.fn() };

    controller = makeController({
      ANDROID_APP_PACKAGE_NAME: 'com.oneplan.android',
      ANDROID_APP_SHA256_CERT_FINGERPRINTS: 'AA:BB:CC, DD:EE:FF',
    });
  });

  describe('getAppleAppSiteAssociation', () => {
    it('returns the AASA payload with the bundle appID and friend/join components', () => {
      const aasa = controller.getAppleAppSiteAssociation();

      expect(aasa).toEqual({
        applinks: {
          details: [
            {
              appIDs: ['GS4TMK323X.lumilabs.oneplan'],
              components: [
                { '/': '/friend/*', comment: 'Friend invites' },
                { '/': '/join/*', comment: 'Trip invites' },
                { '/': '/listing/*', comment: 'Marketplace listings' },
              ],
            },
          ],
        },
      });
    });
  });

  describe('getAndroidAssetLinks', () => {
    it('returns a Digital Asset Links statement with the package and fingerprints (legacy env vars)', () => {
      const links = controller.getAndroidAssetLinks();

      expect(links).toEqual([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'com.oneplan.android',
            sha256_cert_fingerprints: ['AA:BB:CC', 'DD:EE:FF'],
          },
        },
      ]);
    });

    it('fails closed with an empty array and logs a warning when no fingerprints are configured', () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const c = makeController({
        ANDROID_APP_PACKAGE_NAME: 'com.oneplan.android',
        ANDROID_APP_SHA256_CERT_FINGERPRINTS: '',
      });

      expect(c.getAndroidAssetLinks()).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('will NOT verify'),
      );

      warnSpy.mockRestore();
    });

    it('does not warn once at least one package has fingerprints configured', () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      makeController({
        ANDROID_APP_PACKAGE_NAME: 'com.oneplan.android',
        ANDROID_APP_SHA256_CERT_FINGERPRINTS: 'AA:BB:CC',
      });

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('serves one statement per package when ANDROID_APP_LINK_TARGETS declares multiple apps', () => {
      const c = makeController({
        ANDROID_APP_LINK_TARGETS:
          'com.oneplan.android:AA:BB:CC,DD:EE:FF;com.oneplan.android.dev:11:22:33',
      });

      expect(c.getAndroidAssetLinks()).toEqual([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'com.oneplan.android',
            sha256_cert_fingerprints: ['AA:BB:CC', 'DD:EE:FF'],
          },
        },
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'com.oneplan.android.dev',
            sha256_cert_fingerprints: ['11:22:33'],
          },
        },
      ]);
    });

    it('normalizes fingerprints to uppercase and trims surrounding whitespace', () => {
      const c = makeController({
        ANDROID_APP_LINK_TARGETS: 'com.oneplan.android: aa:bb:cc , dd:ee:ff ',
      });

      expect(c.getAndroidAssetLinks()).toEqual([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'com.oneplan.android',
            sha256_cert_fingerprints: ['AA:BB:CC', 'DD:EE:FF'],
          },
        },
      ]);
    });

    it('skips a package declared with no fingerprints while still serving configured ones', () => {
      const warnSpy = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);

      const c = makeController({
        ANDROID_APP_LINK_TARGETS:
          'com.oneplan.android:AA:BB:CC;com.oneplan.android.dev:',
      });

      expect(c.getAndroidAssetLinks()).toEqual([
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: {
            namespace: 'android_app',
            package_name: 'com.oneplan.android',
            sha256_cert_fingerprints: ['AA:BB:CC'],
          },
        },
      ]);
      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('store link (User-Agent switch)', () => {
    const ANDROID_UA =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
    const IOS_UA =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) ' +
      'AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const DESKTOP_UA =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

    const PLAY_URL =
      'https://play.google.com/store/apps/details?id=com.oneplan.android';
    const APP_STORE_URL = 'https://apps.apple.com/app/id6761648165';

    beforeEach(() => {
      (friendsService.getPublicPreviewByCode as jest.Mock).mockRejectedValue(
        new NotFoundException('User not found'),
      );
      (tripsService.getInvitePreview as jest.Mock).mockRejectedValue(
        new NotFoundException('Invalid invite code'),
      );
      (
        marketplaceService.getPublicListingPreview as jest.Mock
      ).mockRejectedValue(new NotFoundException('Listing not found'));
    });

    it.each([
      ['friend', (ua?: string) => controller.friendLanding('CODE', ua)],
      ['join', (ua?: string) => controller.joinLanding('CODE', ua)],
      ['listing', (ua?: string) => controller.listingLanding('123', ua)],
    ])(
      '%s landing points an Android UA at the Play Store',
      async (_n, render) => {
        const html = await render(ANDROID_UA);

        expect(html).toContain(`href="${PLAY_URL}"`);
        expect(html).not.toContain(APP_STORE_URL);
      },
    );

    it.each([
      ['friend', (ua?: string) => controller.friendLanding('CODE', ua)],
      ['join', (ua?: string) => controller.joinLanding('CODE', ua)],
      ['listing', (ua?: string) => controller.listingLanding('123', ua)],
    ])(
      '%s landing points iOS/desktop/unknown UAs at the App Store',
      async (_n, render) => {
        for (const ua of [IOS_UA, DESKTOP_UA, undefined]) {
          const html = await render(ua);

          expect(html).toContain(`href="${APP_STORE_URL}"`);
          expect(html).not.toContain('play.google.com');
        }
      },
    );

    it('keeps the apple-itunes-app smart-banner meta on every landing', async () => {
      const html = await controller.joinLanding('CODE', ANDROID_UA);

      expect(html).toContain(
        '<meta name="apple-itunes-app" content="app-id=6761648165">',
      );
    });

    it('uses the configured Android package for the Play link', async () => {
      const c = makeController({
        ANDROID_APP_PACKAGE_NAME: 'com.oneplan.android.dev',
        ANDROID_APP_SHA256_CERT_FINGERPRINTS: 'AA:BB:CC',
      });

      const html = await c.joinLanding('CODE', ANDROID_UA);

      expect(html).toContain(
        'href="https://play.google.com/store/apps/details?id=com.oneplan.android.dev"',
      );
    });
  });

  describe('friendLanding', () => {
    it('uses per-user copy when the friend code resolves', async () => {
      (friendsService.getPublicPreviewByCode as jest.Mock).mockResolvedValue({
        displayName: 'Carol',
        tripCount: 4,
      });

      const html = await controller.friendLanding('CAROL-CODE');

      expect(html).toContain('Add Carol on OnePlan');
      expect(html).toContain('Carol has sent you a friend request.');
      expect(html).toContain(
        'https://storage.googleapis.com/oneplan-public/og/og-friend.png',
      );
      expect(html).toContain('oneplan://friend/CAROL-CODE');
    });

    it('falls back to generic copy + og-friend.png when friend code is invalid', async () => {
      (friendsService.getPublicPreviewByCode as jest.Mock).mockRejectedValue(
        new NotFoundException('User not found'),
      );

      const html = await controller.friendLanding('BAD-CODE');

      expect(html).toContain('Join me on OnePlan');
      expect(html).toContain(
        'Someone invited you to connect on OnePlan. Install the app to accept.',
      );
      expect(html).toContain(
        'https://storage.googleapis.com/oneplan-public/og/og-friend.png',
      );
      expect(html).toContain('oneplan://friend/BAD-CODE');
    });
  });

  describe('joinLanding', () => {
    it('always uses og-trip.png even when the trip has a cover image', async () => {
      (tripsService.getInvitePreview as jest.Mock).mockResolvedValue({
        name: 'Da Lat 2026',
        coverImageUrl: 'https://signed.example/cover.jpg',
        memberCount: 3,
      });

      const html = await controller.joinLanding('TRIP-CODE');

      // Quotes get HTML-escaped in the rendered output.
      expect(html).toContain('Join &quot;Da Lat 2026&quot; on OnePlan');
      expect(html).toContain('3 travelers on this trip. Tap to join.');
      expect(html).toContain(
        'https://storage.googleapis.com/oneplan-public/og/og-trip.png',
      );
      // Per design decision: do NOT inject the trip cover into og:image.
      expect(html).not.toContain('https://signed.example/cover.jpg');
    });

    it('falls back to generic copy when invite code is invalid', async () => {
      (tripsService.getInvitePreview as jest.Mock).mockRejectedValue(
        new NotFoundException('Invalid invite code'),
      );

      const html = await controller.joinLanding('NOPE');

      expect(html).toContain('Join this trip on OnePlan');
      // Apostrophe is HTML-escaped to &#39; in the rendered output.
      expect(html).toContain(
        'You&#39;ve been invited to plan a trip together.',
      );
    });
  });

  describe('listingLanding', () => {
    it('uses per-listing copy + og-listing.png when the listing resolves', async () => {
      (
        marketplaceService.getPublicListingPreview as jest.Mock
      ).mockResolvedValue({
        name: 'Da Lat 3D2N',
        creatorName: 'Vivian',
        durationDays: 3,
      });

      const html = await controller.listingLanding('123');

      expect(html).toContain('Da Lat 3D2N on OnePlan');
      // Apostrophe is HTML-escaped to &#39; in the rendered output.
      expect(html).toContain(
        'Vivian&#39;s 3-day plan. Tap to view on OnePlan.',
      );
      expect(html).toContain(
        'https://storage.googleapis.com/oneplan-public/og/og-listing.png',
      );
      expect(html).toContain('oneplan://listing/123');
    });

    it('falls back to generic copy when the listing is missing/non-approved', async () => {
      (
        marketplaceService.getPublicListingPreview as jest.Mock
      ).mockRejectedValue(new NotFoundException('Listing not found'));

      const html = await controller.listingLanding('999');

      expect(html).toContain('Check out this trip plan on OnePlan');
      expect(html).toContain(
        'A curated trip plan on OnePlan. Install the app to view and use it.',
      );
      expect(html).toContain(
        'https://storage.googleapis.com/oneplan-public/og/og-listing.png',
      );
      expect(html).toContain('oneplan://listing/999');
    });
  });
});
