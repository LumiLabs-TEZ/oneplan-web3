import {
  CONTENT_LOCALE_CLS_KEY,
  parseAcceptLanguage,
} from './common/locale/content-locale';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsModule } from 'nestjs-cls';
import Joi from 'joi';
import { AdminDashboardModule } from './admin-dashboard/admin-dashboard.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AuthModule } from './auth/auth.module';
import { BudgetsModule } from './budgets/budgets.module';
import { ChatModule } from './chat/chat.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ExpensesModule } from './expenses/expenses.module';
import { HealthModule } from './health/health.module';
import { MarketplaceModule } from './marketplace/marketplace.module';
import { PlanItemsModule } from './plan-items/plan-items.module';
import { PlanRouteModule } from './plan-route/plan-route.module';
import { LocationsModule } from './locations/locations.module';
import { ReceiptScanModule } from './receipt-scan/receipt-scan.module';
import { RecentLocationsModule } from './recent-locations/recent-locations.module';
import { TripNotesModule } from './trip-notes/trip-notes.module';
import { TripPhotosModule } from './trip-photos/trip-photos.module';
import { PrismaModule } from './prisma/prisma.module';
import { TripActivityModule } from './trip-activity/trip-activity.module';
import { StorageModule } from './storage/storage.module';
import { FriendsModule } from './friends/friends.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TripRequestsModule } from './trip-requests/trip-requests.module';
import { TripsModule } from './trips/trips.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { PlanReminderModule } from './plan-reminder/plan-reminder.module';
import { DeeplinksModule } from './deeplinks/deeplinks.module';
import { ExchangeRatesModule } from './exchange-rates/exchange-rates.module';
import { BoardModule } from './board/board.module';
import { TelegramModule } from './telegram/telegram.module';
import { JournalModule } from './journal/journal.module';
import { WeatherModule } from './weather/weather.module';
import { EngagementModule } from './engagement/engagement.module';
import { TripGeneratorModule } from './trip-generator/trip-generator.module';
import { GiftModule } from './gift/gift.module';
import { MissionsModule } from './missions/missions.module';
import { DeletedUsersModule } from './deleted-users/deleted-users.module';
import { FareWatchModule } from './fare-watch/fare-watch.module';
import { TractionModule } from './traction/traction.module';
import { adminConfig } from './config/admin.config';
import { solanaConfigSchema } from './solana/solana.config';
import { SolanaModule } from './solana/solana.module';
import { TripVaultModule } from './trip-vault/trip-vault.module';
import { Web3Module } from './web3/web3.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [adminConfig],
      validationSchema: Joi.object({
        PORT: Joi.number().port().default(3000),
        DATABASE_URL: Joi.string()
          .uri({ scheme: ['postgresql', 'postgres'] })
          .default(
            'postgresql://postgres:postgres@localhost:5432/oneplan?schema=public',
          ),
        SERVER_COMMIT_SHA: Joi.string().allow('').optional(),
        GIT_COMMIT_SHA: Joi.string().allow('').optional(),
        COMMIT_SHA: Joi.string().allow('').optional(),
        // GCS object storage. Uses its own SA (STORAGE_SA_KEY_FILE), separate
        // from the Vertex/Gemini SA (VERTEX_SA_KEY_FILE). Media bucket is
        // private (signed URLs only); public bucket hosts static OG images
        // and must have `allUsers:objectViewer` granted at the bucket IAM level.
        GCS_MEDIA_BUCKET: Joi.string().default('oneplan-media'),
        GCS_PUBLIC_BUCKET: Joi.string().default('oneplan-public'),
        // Absolute path to the storage SA JSON. Empty falls back to ADC
        // (`gcloud auth application-default login`) for local dev.
        STORAGE_SA_KEY_FILE: Joi.string().allow('').default(''),
        JWT_SECRET: Joi.string().min(32).required(),
        JWT_REFRESH_SECRET: Joi.string().min(32).required(),
        JWT_ACCESS_EXPIRATION: Joi.string().default('15m'),
        JWT_REFRESH_EXPIRATION: Joi.string().default('30d'),
        APPLE_CLIENT_ID: Joi.string().min(1).required(),
        // Web Sign in with Apple uses a separate Services ID. Optional —
        // when empty the AppleAuthService falls back to iOS-only audience.
        APPLE_WEB_CLIENT_ID: Joi.string().allow('').default(''),
        GOOGLE_CLIENT_ID: Joi.string().min(1).required(),
        GOOGLE_PLAY_PACKAGE_NAME: Joi.string().allow('').default(''),
        // R.4 / §6.11: Android App Links Digital Asset Links. Statements
        // served at /.well-known/assetlinks.json (the Android counterpart of
        // the iOS AASA on the same hosts). dev and prod are separate Play
        // apps with separate packages + signing certs, so this is a
        // semicolon-separated list of `package:fingerprint1,fingerprint2,...`
        // entries — one statement per package. A package with no fingerprints
        // configured is skipped and logged as a startup warning rather than
        // silently shipping a malformed/empty response.
        ANDROID_APP_LINK_TARGETS: Joi.string().allow('').default(''),
        // Legacy single-package fallback, only read when
        // ANDROID_APP_LINK_TARGETS is unset. Defaults to the release
        // applicationId in android/app/build.gradle.kts.
        ANDROID_APP_PACKAGE_NAME: Joi.string()
          .allow('')
          .default('com.oneplan.android'),
        // Comma-separated SHA-256 signing-cert fingerprints (uppercase hex,
        // colon-separated, e.g. "AB:CD:..."). Include BOTH the Play App
        // Signing cert and the upload cert. Empty until the keystore is
        // provisioned — the endpoint then serves an empty target list so
        // autoVerify fails closed (links fall back to the landing page,
        // never crash).
        ANDROID_APP_SHA256_CERT_FINGERPRINTS: Joi.string()
          .allow('')
          .default(''),
        GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL: Joi.string().allow('').default(''),
        GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY: Joi.string()
          .allow('')
          .default(''),
        // Android counterpart of APP_STORE_ENVIRONMENT: one shared Play app +
        // product set backs both dev- and prod-pointed builds, so the server
        // must reject license-tester (test) purchases when Production —
        // otherwise a test purchase could grant prod Pro. Safe-by-default:
        // unconfigured => 'Production' => rejects test purchases. dev/local
        // MUST explicitly set 'Test' to accept and label test purchases.
        // 'Auto' accepts both (label from the Play test flag) and is not
        // safe for prod.
        GOOGLE_PLAY_ENVIRONMENT: Joi.string()
          .valid('Test', 'Production', 'Auto')
          .default('Production'),
        // Audience configured on the Pub/Sub push subscription that delivers
        // Play RTDN to our webhook (typically the full webhook URL).
        // google-pubsub.guard.ts checks the OIDC token's `aud` claim against
        // this. Empty is a valid, unconfigured state — the guard just
        // rejects every push with 401 rather than failing startup.
        GOOGLE_PUBSUB_AUDIENCE: Joi.string().allow('').default(''),
        THROTTLE_LIMIT: Joi.number().integer().min(1).default(10),
        APNS_KEY_ID: Joi.string().optional().allow(''),
        APNS_TEAM_ID: Joi.string().optional().allow(''),
        APNS_KEY_PATH: Joi.string().optional().allow(''),
        APNS_BUNDLE_ID: Joi.string().default('com.oneplan.app'),
        APNS_PRODUCTION: Joi.string().default('false'),
        // Absolute path to the FCM (Android push) service-account JSON.
        // Empty is a valid, intentional state — FcmPushAdapter falls back to
        // a null messaging client and every send resolves { sent: 0 } rather
        // than throwing.
        FCM_SERVICE_ACCOUNT_PATH: Joi.string().optional().allow(''),
        // Gemini — receipt OCR + Board video understanding (via Vertex AI).
        GEMINI_MODEL_ID: Joi.string().default('gemini-2.5-flash'),
        // Vertex AI — GCP project + region + GCS staging bucket. Treated as
        // optional at boot (matches GEMINI_API_KEY); GeminiService throws a
        // clean 502 at request time if any of the three required values are
        // empty when an extraction is actually attempted.
        GOOGLE_CLOUD_PROJECT: Joi.string().allow('').default(''),
        // `global` is required for Gemini 2.5 — regional endpoints 404 it.
        GOOGLE_CLOUD_LOCATION: Joi.string().default('global'),
        GCS_GEMINI_BUCKET: Joi.string().allow('').default(''),
        // Absolute path to the Vertex/Gemini service-account JSON. Empty
        // falls back to ADC (`gcloud auth application-default login`).
        VERTEX_SA_KEY_FILE: Joi.string().allow('').default(''),
        // Set to 'true' to log every raw SSE chunk from Gemini and the
        // extracted text. Off by default — only enable while debugging.
        GEMINI_DEBUG: Joi.string().valid('true', 'false').default('false'),
        // YT_DLP_PATH must either be the bare binary name (resolved via
        // $PATH) or an absolute path. Relative paths like '../bin/x' that
        // depend on cwd are rejected to prevent operator misconfiguration
        // from executing an unexpected binary.
        YT_DLP_PATH: Joi.string()
          .pattern(/^(yt-dlp|\/.+)$/)
          .default('yt-dlp'),
        // Same bare-name-or-absolute-path rule as YT_DLP_PATH. gallery-dl
        // handles TikTok photo (image carousel) posts, which yt-dlp
        // explicitly does not support.
        GALLERY_DL_PATH: Joi.string()
          .pattern(/^(gallery-dl|\/.+)$/)
          .default('gallery-dl'),
        // How long a pin-extraction cache row stays servable before it's
        // treated as a MISS (forces re-extraction, even for the original
        // payer). Mirrors the ScanCreditGrant.expiresAt pattern.
        PIN_EXTRACTION_CACHE_TTL_DAYS: Joi.number().integer().min(1).default(7),
        APP_STORE_ISSUER_ID: Joi.string().optional().allow(''),
        APP_STORE_KEY_ID: Joi.string().optional().allow(''),
        APP_STORE_BUNDLE_ID: Joi.string().optional().allow(''),
        APP_STORE_PRIVATE_KEY: Joi.string().optional().allow(''),
        APP_STORE_ENVIRONMENT: Joi.string()
          .valid('Auto', 'Sandbox', 'Production', 'Xcode', 'LocalTesting')
          .default('Auto'),
        APP_STORE_APP_APPLE_ID: Joi.string().optional().allow(''),
        EXCHANGERATE_API_KEY: Joi.string().optional().allow('').default(''),
        MARKETPLACE_TRENDING_WINDOW_DAYS: Joi.number()
          .integer()
          .min(1)
          .default(30),
        // Scan-credit ledger (Board/Pin). Signup bonus is a one-time grant;
        // Pro plans grant the full per-billing-cycle amount upfront on the
        // initial purchase and again on every Apple auto-renewal. The
        // _PRO_WEEKLY/_MONTHLY/_YEARLY suffix names the Pro SKU, not a cadence.
        SIGNUP_BONUS_SCAN_CREDITS: Joi.number().integer().min(0).default(2),
        SCAN_GRANT_PRO_WEEKLY: Joi.number().integer().min(0).default(3),
        SCAN_GRANT_PRO_MONTHLY: Joi.number().integer().min(0).default(20),
        SCAN_GRANT_PRO_YEARLY: Joi.number().integer().min(0).default(300),
        SCAN_GRANT_PAY_ONCE: Joi.number().integer().min(0).default(10),
        // App-update reward: granted once per (user, app version) when the
        // client reports running a version >= the floor. _ENABLED is the pause
        // switch — keep it a STRING ('true'/'false'); the service reads
        // `!== 'false'`, so switching to Joi.boolean() would silently break it.
        SCAN_GRANT_APP_UPGRADE: Joi.number().integer().min(0).default(5),
        SCAN_GRANT_APP_UPGRADE_ENABLED: Joi.string()
          .valid('true', 'false')
          .default('true'),
        SCAN_GRANT_APP_UPGRADE_MIN_VERSION: Joi.string().default('1.2.5'),
        // Optional during the dashboard/admin split deploy cycle so a
        // VPS .env that hasn't been renamed yet doesn't fail Joi validation
        // and refuse to boot. Tighten to .min(1).required() in a follow-up
        // PR once /opt/oneplan/{dev,prod}/.env is updated on the VPS.
        ADMIN_EMAILS: Joi.string().allow('').default(''),
        ADMIN_WEB_ORIGINS: Joi.string().allow('').default(''),
        DASHBOARD_WEB_ORIGINS: Joi.string().allow('').default(''),
        TRACTION_WEB_ORIGINS: Joi.string().allow('').default(''),
        // Telegram marketing bot (offer-code distribution). Two independent
        // flags: BOT_ENABLED runs the long-poll loop at all (set true ONLY in
        // prod — Telegram allows one poller per token); CAMPAIGN_ENABLED is the
        // marketing window that shows the "Get Code" button + hands out codes.
        // The token is validated at runtime in TelegramBotService when enabled
        // (matches the optional-secret style of APP_STORE_*/APNS_*).
        TELEGRAM_BOT_ENABLED: Joi.string()
          .valid('true', 'false')
          .default('false'),
        TELEGRAM_CAMPAIGN_ENABLED: Joi.string()
          .valid('true', 'false')
          .default('false'),
        TELEGRAM_BOT_TOKEN: Joi.string().allow('').default(''),
        TELEGRAM_BOT_USERNAME: Joi.string().allow('').default(''),
        TELEGRAM_GROUP_ID: Joi.string().allow('').default(''),
        TELEGRAM_WELCOME_TEXT: Joi.string().allow('').default(''),
        TELEGRAM_CAMPAIGN_CTA: Joi.string().allow('').default(''),
        // Auto-start cron: flips PLANNING trips to ONGOING on their start date.
        TRIP_AUTO_START_ENABLED: Joi.string()
          .valid('true', 'false')
          .default('true'),
        // Engagement push engine. ENGAGEMENT_ENABLED gates the cron entirely;
        // per-trigger flags allow dark-launching one trigger at a time. Read
        // once via ConfigService at runtime — restart to apply changes.
        ENGAGEMENT_ENABLED: Joi.string()
          .valid('true', 'false')
          .default('false'),
        ENGAGEMENT_TRIGGER_UNFINISHED: Joi.string()
          .valid('true', 'false')
          .default('true'),
        ENGAGEMENT_TRIGGER_WEATHER: Joi.string()
          .valid('true', 'false')
          .default('true'),
        ENGAGEMENT_TRIGGER_DORMANT: Joi.string()
          .valid('true', 'false')
          .default('true'),
        ENGAGEMENT_TRIGGER_NEW_PLAN: Joi.string()
          .valid('true', 'false')
          .default('true'),
        ENGAGEMENT_DORMANT_DAYS: Joi.number().integer().min(1).default(14),
        ENGAGEMENT_SEND_START_HOUR: Joi.number()
          .integer()
          .min(0)
          .max(23)
          .default(10),
        ENGAGEMENT_SEND_END_HOUR: Joi.number()
          .integer()
          .min(1)
          .max(24)
          .default(20),
        ENGAGEMENT_UNFINISHED_MIN_AGE_HOURS: Joi.number()
          .integer()
          .min(0)
          .default(24),
        ENGAGEMENT_UNFINISHED_PLAN_THRESHOLD: Joi.number()
          .integer()
          .min(0)
          .default(3),
        ENGAGEMENT_NEW_PLAN_LOOKBACK_DAYS: Joi.number()
          .integer()
          .min(1)
          .default(14),
        WEATHER_HOT_C: Joi.number().default(33),
        WEATHER_COLD_C: Joi.number().default(12),
        GOOGLE_MAPS_WEATHER_API_KEY: Joi.string().allow('').default(''),
        WEATHER_DEFAULT_TIMEZONE: Joi.string().default('Asia/Ho_Chi_Minh'),
        // Plan-route day map (Mapbox Directions API). Optional: unset skips
        // the upstream call and falls back to straight-line legs (no 500).
        MAPBOX_ACCESS_TOKEN: Joi.string().allow('').default(''),
        ...solanaConfigSchema,
      }),
    }),
    ScheduleModule.forRoot(),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        setup: (
          cls,
          req: { headers?: Record<string, string | string[] | undefined> },
        ) => {
          const headers = req.headers ?? {};
          const sessionId = headers['x-session-id'];
          const anonymousId = headers['x-anonymous-id'];
          if (typeof sessionId === 'string') cls.set('sessionId', sessionId);
          if (typeof anonymousId === 'string')
            cls.set('anonymousId', anonymousId);
          cls.set(
            CONTENT_LOCALE_CLS_KEY,
            parseAcceptLanguage(headers['accept-language']),
          );
        },
      },
    }),
    PrismaModule,
    AnalyticsModule,
    AuthModule,
    HealthModule,
    LocationsModule,
    StorageModule,
    TripsModule,
    BudgetsModule,
    ExpensesModule,
    MarketplaceModule,
    TripRequestsModule,
    PlanItemsModule,
    PlanRouteModule,
    TripNotesModule,
    TripPhotosModule,
    TripActivityModule,
    RecentLocationsModule,
    ChatModule,
    NotificationsModule,
    FriendsModule,
    RealtimeModule,
    ReceiptScanModule,
    SubscriptionModule,
    PlanReminderModule,
    DeeplinksModule,
    ExchangeRatesModule,
    BoardModule,
    AdminDashboardModule,
    TelegramModule,
    JournalModule,
    WeatherModule,
    EngagementModule,
    TripGeneratorModule,
    GiftModule,
    MissionsModule,
    DeletedUsersModule,
    SolanaModule,
    TripVaultModule,
    Web3Module,
    FareWatchModule,
    TractionModule,
  ],
})
export class AppModule {}
