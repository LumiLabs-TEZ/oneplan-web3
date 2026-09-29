# OnePlan mobile (React Native / Expo SDK 57)

Replaces `ios/` and `android/` — see `docs/superpowers/specs/2026-09-10-react-native-migration-plan.md`.
Plans: Phase 0 `docs/superpowers/plans/2026-09-11-rn-migration-phase0-foundation.md`,
Phase 1 `docs/superpowers/plans/2026-09-13-rn-migration-phase1-vertical-slice.md`,
Phase 2 `docs/superpowers/plans/2026-09-14-rn-migration-phase2-trip-core.md`,
Phase 3 `docs/superpowers/plans/2026-09-16-rn-migration-phase3-plans-notes-locations.md`,
Phase 4 `docs/superpowers/plans/2026-09-17-rn-migration-phase4-friends-profile-settings-subscription.md`.
Acceptance contract: `docs/superpowers/specs/parity/rn-parity-checklist.md`.

```bash
pnpm install
pnpm start                      # Expo dev server (needs a dev-client build installed)
eas build --profile development --platform all   # APP_VARIANT=dev → dev-api.oneplan.space
APP_VARIANT=dev API_URL=http://localhost:3000 npx expo run:ios --device "iPhone 17"   # local build (Xcode 26.2 needs patches/expo-modules-jsi)
JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home maestro test .maestro/phase1-smoke.yaml

pnpm typecheck && pnpm lint && pnpm test && pnpm doctor:expo
pnpm api:gen      # ../openapi/openapi.json → src/api/schema.d.ts   (api:check = drift gate)
pnpm i18n:gen     # ../ios/.../Localizable.xcstrings → src/i18n/locales/{en,vi}.json  (i18n:check = drift gate)
pnpm i18n:gen --report   # list vi keys falling back to English + placeholder mismatches
pnpm i18n:add '<key>' '<vi>' '<comment>'   # add a new EN-source key to the iOS catalog, then i18n:gen
pnpm check:google        # web client id per EAS profile — must match the target server's GOOGLE_CLIENT_ID
```

Environment is selected at build time with `APP_VARIANT=local|dev|prod` (see `app.config.ts`);
app code reads it only via `src/lib/env.ts`. Firebase files are CI-injected (`google-services/README.md`).

## App structure (Phase 1)

| Area | Where | Notes |
|---|---|---|
| Root gate | `src/app/_layout.tsx`, `src/auth/gate.ts` | `Stack.Protected`: onboarding → login → `(tabs)` (order from `OnePlanApp.swift`). `UpdateRequired` overlays everything. |
| Tabs | `src/app/(tabs)/`, `src/features/shell/` | home / trip / board / market; custom `AppTabBar` + `Fab` quick actions + shared `AppHeader`. |
| Trip detail | `src/app/trip/[tripId]/`, `src/features/trip/` | `TripDetailProvider` (tripId-keyed queries, `tripAccess` flags). History tab only in Phase 1. |
| Expenses | `src/app/trip/[tripId]/expense/`, `src/features/expense/` | keypad reducer → details sheet → `useCreateExpense`; detail + dirty-diff edit. |
| Auth | `src/auth/` | Apple / Google → `POST /auth/social`; `signOutEverywhere` = push unregister → `/auth/logout` → cache wipe. |
| Push | `src/push/`, `src/links/` | token register/unregister (deduped), `parsePushPayload` → `Link`; Phase 1 routes trips only, rest → `pendingLinkStore`. |
| Analytics | `src/analytics/` | 30-min sessions, `PATCH …/end` on background, batched events (≤50, queue 500). |
| Offline | `src/offline/` | MMKV query persister (`meta.persist`, ongoing trip only), `isServingCached`, `useIsOnline`. |
| Version gate | `src/native/versionGate.ts`, `src/ui/screens/UpdateRequired.tsx` | iTunes lookup (iOS) / Play In-App Updates (Android), fail-open. `EXPO_PUBLIC_FORCE_UPDATE_GATE=1` forces it for QA. |
| UI kit | `src/ui/components/`, `src/ui/theme.ts`, `src/ui/typography.ts`, `src/ui/assets.ts` | SVG assets are components (`react-native-svg-transformer`). |

Dev-only: `/(dev)/spike` (Phase 0 native spike) is registered when `APP_VARIANT !== 'prod'`.

## App structure (Phase 2 additions)

| Area | Where | Notes |
|---|---|---|
| Create trip | `src/app/trip/new/{_layout,index,location}.tsx`, `src/features/trip/{createTripStore.ts,helpers/createTripGate.ts}` | `trip/new` is a `presentation: 'modal'` route with its own `BottomSheetModalProvider` (the root portal host sits below native modals); `location` is a nested modal (debounced search, `useSuggestedCities`/`useLocationSearch`). |
| Budgets | `src/app/trip/[tripId]/budget/{new,index,[budgetId]/edit}.tsx`, `src/features/budget/` | `new` shares the expense `AmountEntryScreen`/keypad reducer; `index` is the "Who Deposit" history + progress view; `edit` is a dirty-diff PATCH (`editBudgetDiff.ts`), same pattern as expense edit. |
| Trip menu & sheets | `src/features/trip/components/{TripMenuSheet,CurrencyPickerSheet,TripDatesSheet,StartTripSheet,LeaveTripSheet}.tsx`, `helpers/{tripMenu,leaveModel}.ts` | `tripMenuItems(ctx)` builds the ellipsis-menu row list per role/trip-status; end-trip and delete-trip are plain `Alert`s raised by `src/features/trip/components/TripMenuController.tsx`, not sheets. |
| Trip end | `src/app/trip/[tripId]/end.tsx`, `src/features/settlement/` | History/Breakdown via `SegmentedToggle` (not a `TabView`); shared-album download via `src/features/photos/downloadAll.ts`; rating sheet only renders when `trip.marketplaceListingId` is set. |
| Invite | `src/app/trip/[tripId]/invite.tsx`, `src/app/join/[code].tsx`, `src/features/invite/` | QR + share-link invite card; drag-to-join screen (`helpers/dragToJoin.ts`); pending-invites queue (below); first-open invite sheet gate (`helpers/firstOpenInvite.ts`, MMKV key per trip). |
| Realtime | `src/realtime/` | WebSocket client + invalidation (below). |
| Deep links | `src/links/`, `src/app/+native-intent.ts`, `src/app/_parked.tsx` | URL parsing + park-or-navigate (below). |
| Uploads | `src/uploads/uploadService.ts`, `src/native/imagePick.ts` | Presigned S3 upload pipeline (below). |

### Routes added

- `src/app/trip/new/index.tsx` + `src/app/trip/new/location.tsx` (modal stack, `src/app/trip/new/_layout.tsx`) — create-trip form and the location-picker modal.
- `src/app/trip/[tripId]/invite.tsx` — QR + share-link invite screen.
- `src/app/trip/[tripId]/budget/new.tsx`, `src/app/trip/[tripId]/budget/index.tsx`, `src/app/trip/[tripId]/budget/[budgetId]/edit.tsx` — add / "Who Deposit" history / edit.
- `src/app/trip/[tripId]/end.tsx` — trip-end recap (History/Breakdown), also reached from `src/app/trips/ended.tsx` with `?mode=ended`.
- `src/app/join/[code].tsx` (+ `src/app/join/_layout.tsx`, `gestureEnabled: false`) — drag-to-join screen, reached from deep links and push.
- `src/app/_parked.tsx` — sink route for a warm-start deep link with no screen yet (Phase 4/5/7 kinds); renders nothing and bounces back to the previous screen.

> **Note on `[tripId]`:** git treats the bracket segment as a shell glob. When staging/diffing those
> paths from a shell, quote them with a literal pathspec, e.g.
> `git add -A -- 'mobile/src/app/trip/[tripId]/end.tsx'` or `git diff -- ':(literal)mobile/src/app/trip/[tripId]'`.

### Realtime lifecycle

- **Connect.** `useRealtime()` (mounted in `SessionEffects`, `src/app/_layout.tsx`) opens the
  `RealtimeClient` (`src/realtime/RealtimeClient.ts`) once `useAuthStore` is `authed`; header-based
  auth (no query-string token). Disconnects and resets client state on sign-out
  (`installRealtimeSignOutHook`, alongside the push/invite/link sign-out hooks).
- **Backoff.** `src/realtime/backoff.ts` `nextDelayMs(attempt, random)` — `min(attempt*2000, 30000)` ±30%
  jitter, gives up after attempt 10 (`null` → `permanentlyDisconnected`).
- **Background grace.** `setForeground(false)` starts a 30s grace timer (`BACKGROUND_GRACE_MS`) before
  actually closing the socket, so a quick app-switch doesn't force a reconnect; `setForeground(true)`
  cancels the pending grace or reconnects if it already fired.
- **Rooms.** `useTripRoom` (consumed from trip-detail screens) joins/leaves a per-trip room; the full
  room set replays automatically on every reconnect, so screens only track mount/unmount.
- **Auth failure.** An `error` envelope matching "Authentication failed" (`isAuthFailure`,
  `src/realtime/envelope.ts`) triggers one token refresh (`refreshOnce`, deduped via a
  `refreshInFlight` guard); success resets the attempt counter and reconnects, failure gives up.
- **Invalidation.** `src/realtime/invalidation.ts` `invalidationFor(event)` maps each server event to
  the TanStack Query keys to invalidate (see the parity checklist's realtime table for the full
  event → action list); effects that need UI action (navigate to TripEnd, alert on trip deletion)
  go through `realtimeStore.pushEffect`/`consumeEffect` instead of a direct side effect, so the
  consuming screen decides how/when to react.

### Deep-link flow

1. **Entry.** `src/app/+native-intent.ts` `redirectSystemPath` handles cold start and warm taps.
   `src/links/parseUrl.ts` `parseUrlToLink(input, hosts)` recognizes custom-scheme (`oneplan://…`),
   universal (`https://{host}/…`), and bare-path forms. An authed `tripInvite` link routes straight
   to `/join/{code}`; every other recognized kind (or a not-yet-authed `tripInvite`) is parked in
   `src/links/pendingLinkStore.ts` and the function returns `initial ? '/' : '/_parked'` — never both
   park *and* return a route (that would double-navigate).
2. **Warm-start sink.** `src/app/_parked.tsx` renders nothing and immediately pops back (or replaces
   `/`), so a warm parked link (e.g. `oneplan://listing/12` while on another tab) leaves the current
   screen untouched instead of flashing a blank route.
3. **Replay.** `src/links/useLinkResolver.ts` `useLinkResolver({ready})` watches `pendingLinkStore` and
   re-checks on every `ready`/`authed` transition; once `hrefForLink` (`src/links/href.ts`) resolves a
   route and the app can render it, it consumes the pending link and `router.push`es.
4. **Live events.** `src/links/useUrlListener.ts` covers `Linking.getInitialURL()` and the `url` event
   for cases `+native-intent` doesn't cover (e.g. warm taps while already inside the JS runtime);
   dedupes an identical URL fired twice within 2s.
5. **Push taps.** `src/push/responses.ts` `routeForPushOpen` — if `hrefForLink(link)` resolves and the
   app is `ready && authed`, navigate immediately; otherwise store the link and let `useLinkResolver`
   replay it after login/app-ready. `trip_invite` pushes (`inviteCode` extra) now land on `/join/[code]`
   (Phase 1 only routed `trip`-kind pushes).

Recognized forms (Phase 2): `join`/`friend`/`listing`/`board/extract` — see the parity checklist's
"Deep-link forms" table for the full kind/route/status matrix.

### Pending invites queue

`src/features/invite/pendingInvitesStore.ts` — MMKV-persisted zustand store
(`{invites, queue, activeCode}`), sourced from three places: `usePendingInvitesSync` (poll
`GET /trips/invites/pending` on auth + foreground), `useInviteRealtimeBridge` (registers with
`realtimeStore`'s invite listener for `tripInviteReceived`), and `join/[code].tsx` itself (`source:
'deepLink'`, so a link tap surfaces in the banner even if the join is dismissed). `upsert` updates
in place by `inviteCode` preserving array position; `resolve` removes on accept; `takeNext`
dequeues, skipping any code no longer present. Reset on sign-out
(`installInviteSignOutHook`). Auto-presenter: `src/features/invite/useInvitePresenter.ts`, mounted
once in `src/app/(tabs)/_layout.tsx` — it dequeues and routes to `join/[code]`.
`src/features/home/components/InvitationBanner.tsx` is the Home-screen banner for the first pending
invite. First-open gate for the trip-detail invite sheet:
`src/features/invite/helpers/firstOpenInvite.ts` (`shouldShowFirstOpenInvite`, MMKV key per trip via
`firstOpenInviteKey`).

### Upload service

`src/uploads/uploadService.ts` — port of `Services/StorageUploadService.swift`. Flow: compress
(`prepareJpeg`, JPEG quality 0.85 via `expo-image-manipulator`'s `manipulateAsync`) → presign
(`POST` returns an S3 `uploadUrl` + `UploadResultDto`) → `PUT` the prepared file to that URL →
confirm with the server. Every dependency is injectable so tests never touch the network or the
filesystem. `src/native/imagePick.ts` `pickImage()` wraps `expo-image-picker` (permission request +
`launchImageLibraryAsync`). Call sites: `HomeCard` cover picker/rename (trip detail) and
`trip/new/index.tsx`'s cover picker (create-trip flow).

### Maestro flows

- `.maestro/phase1-smoke.yaml` — Phase 1 vertical slice (login → home → trip → expense). Selectors
  were updated for the Phase 2 keypad refactor (`keypad-next`/`amount-display` →
  `amount-entry-next`/`amount-entry-display`) but the flow itself was not re-run in M4.2.
- `.maestro/phase2-smoke.yaml` — dev sign-in → create trip (name + location search + duration) →
  trip detail → add budget → budget detail → start trip → end trip → trip-end recap/breakdown → home.
- `.maestro/phase2-deeplink.yaml` — opens `oneplan://join/{code}` on a warm, signed-in app and
  asserts the drag-to-join screen renders (does not drag/join, so it's idempotent and re-runnable).
- `.maestro/phase3-smoke.yaml` — Home → ongoing-trip card → Plan tab → New Plan → Save → card in
  the Day timeline → Edit → rename → Update → Delete → confirm → gone → Note tab → New note → Save
  → toggle `note-checkbox-0` → back to Home. Green end to end twice in a row (M6.2); see
  `task-M6.2-report.md` for header-icon-tap retry and text-vs-id-selector gotchas baked into the
  flow. `phase3-location.yaml` (Foursquare location picker) was **not** written/run —
  `FOURSQUARE_API_KEY` unset in `server/.env`.

## App structure (Phase 3 additions)

| Area | Where | Notes |
|---|---|---|
| Plan tab | `src/app/trip/[tripId]/plan/{new,[itemId]/index,[itemId]/edit,day-map,location}.tsx`, `src/features/plan/` | `TripPlanSection` (day chips + timeline) hosted from trip detail; `new`/`[itemId]/edit` share `PlanForm` + `planForm.ts` reducer; `[itemId]/index` is the read-only detail (history card, prev/next strip, orbit mini-map); `day-map` is the full-day map sheet; `location` is the Foursquare place picker/viewer (see below). |
| Notes tab | `src/features/note/` (`TripNoteSection`, `NoteCardRow`, `AddNoteSheet`) | Contracts F/G/H off `rn-parity-checklist.md`; tap-to-delete only (see Deviations in the parity checklist — full-swipe auto-delete isn't expressible via `ReanimatedSwipeable`'s public API). |
| Maps + place search | `src/native/maps/{provider,placeSearch,foursquare,useOrbitCamera}.ts` | `mapProvider()` returns `'google'` on Android / `undefined` on iOS (Apple tiles) — pass as `<MapView provider={mapProvider()} />`, never hardcode a provider. `placeSearchProvider()` resolves the Foursquare-backed `PlaceSearchProvider` singleton from `env.foursquareApiKey` (degrades to empty results, never throws, when the key is unset). |
| Audio | `src/native/audio/{recorder,player,waveform}.ts` | `useVoiceRecorder`/`useVoicePlayer` wrap `expo-audio`; `waveform.ts` owns `WAVEFORM_BARS` (51), `MAX_RECORD_SECONDS` (15), `METER_HZ`, and the live/`staticBars` sample buffers. Screens must go through these wrappers, not `expo-audio` directly. |
| Day counter | `src/features/plan/planningDayCountStore.ts` | Zustand store keyed by `tripId`, shared by `usePlanDay` (trip-detail) and the `new`/`edit` form routes — mirrors iOS `TripDetailService`'s single day-counter source of truth for planning-mode trips with no scheduled dates yet. |
| Day-op executor | `src/features/plan/useDayOps.ts` | There is no server reorder/batch endpoint: `addDay`/`deleteDay`/`rearrange` translate to N× `PATCH`/`DELETE` plan-item calls (`helpers/planDays.ts`'s `addDayOps`/`deleteDayOps`/`rearrangeOps`), applied optimistically to the query cache first, then fired via `Promise.allSettled` (a partial failure alerts but does not roll back — best-effort, matching the plan's "no batch endpoint" constraint) and followed by a plan-items + trip invalidation regardless of outcome. |

### Routes added (Phase 3)

- `src/app/trip/[tripId]/plan/new.tsx`, `plan/[itemId]/index.tsx`, `plan/[itemId]/edit.tsx` — create / view / edit a plan item.
- `src/app/trip/[tripId]/plan/day-map.tsx` — full-day map sheet (`DayMapSheet.tsx`), legs sourced from `/plan-route` with a straight-line fallback.
- `src/app/trip/[tripId]/plan/location.tsx` — location picker (`mode=pick`, pushed from `PlanForm`'s location row) and read-only viewer (`mode=view`).

### Env keys (Phase 3)

`GOOGLE_MAPS_ANDROID_API_KEY` and `FOURSQUARE_API_KEY` are read in `app.config.ts`
(`android.config.googleMaps.apiKey`, `extra.foursquareApiKey`, both default to an empty/`'unset'`
placeholder when absent) and exposed to app
code exclusively through `src/lib/env.ts` (`env.foursquareApiKey`, `null` when unset). Missing
`FOURSQUARE_API_KEY` degrades the location picker to empty search results rather than throwing.

### Metro env requirement

Starting Metro plain (`npx expo start --dev-client`) makes the dev-client fall back to
`https://dev-api.oneplan.space` regardless of what env the native build (`expo run:ios`/`prebuild`)
was built with — `app.config.ts` re-evaluates per Metro process, and `Constants.expoConfig` is read
from whichever process is currently serving JS. For a local server, start Metro with:

```bash
APP_VARIANT=dev API_URL=http://localhost:3000 npx expo start --dev-client
```

Symptom when this is missed: Home silently shows "No trip planned" (an empty list from the wrong
backend) with no visible error — see `task-M6.2-report.md`.

**Preconditions (both Phase 2 flows), from `task-M4.2-report.md`:**
- Toggle off the expo-dev-client **"Tools button"** (floating gear, top right) once in the dev menu —
  it overlaps the trip-detail ellipsis and swallows the tap.
- Only **one** OnePlan variant may be installed on the simulator — all variants register the
  `oneplan` scheme, so a second install can hijack `oneplan://join/…` into the wrong app.
- `phase2-smoke.yaml` requires the dev user to have **no ONGOING trip** (Start Trip Now 400s with
  `MEMBER_CONFLICT` otherwise) and fewer than 3 PLANNING trips; delete leftover "Phase2 Smoke Trip"
  rows between runs.
- Run with `JAVA_HOME=$(brew --prefix openjdk@17) maestro test .maestro/phase2-smoke.yaml` (add
  `-e INVITE_CODE=<code>` for `phase2-deeplink.yaml`) against a dev-client build
  (`APP_VARIANT=dev API_URL=http://localhost:3000 npx expo run:ios --device "iPhone 17" --no-bundler`,
  then `npx expo start --dev-client`).

## App structure (Phase 4 additions)

| Area | Where | Notes |
|---|---|---|
| Profile | `src/app/profile/{_layout,index}.tsx`, `src/features/profile/` | `OP-2006-2710` friend-code label, 3 placeholder mutual avatars — locked mocks, not real data (`features/profile/helpers/profileLabels.ts`). |
| Settings | `src/app/profile/settings.tsx`, `src/features/settings/` | Display name (commit-on-dismiss sheet), language picker, currency picker (reuses `trip/components/CurrencyPickerSheet`), delete account. No restart alert on language change (deviation from iOS). |
| Passport | `src/app/profile/passport.tsx`, `src/features/passport/` | `PassportCard` (full/compact), `PassportMRZLines` (64/54-char lines, `helpers/mrz.ts`), share row (IG Stories / Message / Photos, `native/share/*`). |
| Invite / QR | `src/app/profile/invite.tsx`, `src/native/camera/QRScanner.tsx` | Pull-to-reveal scanner (`features/friends/helpers/pullToReveal.ts`), 1s scan dedupe. |
| Friends | `src/app/profile/friends/{index,[userId]}.tsx`, `src/features/friends/` | List, per-friend profile, pending-request rows; single query cache (`features/friends/api/{queries,mutations}.ts`), not per-screen copies. |
| Friend request flows | `src/app/friend/[code].tsx` (send), `src/app/friend-request/[id].tsx` (receive) | Locked mocks: 6 fixed flag badges + circular text (send), `MEMBER SINCE 2025` ring text (receive). Dismissing a request is **not** the same as declining it. |
| Root modals | `src/features/shell/rootModals.ts`, `useRootModalPresenter.ts` | Free trial → incoming friend request → trip invite, one at a time, gated on `authed && !blocked && active === null` (`nextRootModal`). Friend codes are **not** queued: a deep link / QR scan / Members "Add" always navigates straight to `/friend/[code]`, and that screen claims the root-modal window itself on mount (`kind: 'friendCode'`, only when nothing else owns it) so no other modal lands on top. A friend request pre-empts a queued trip invite by design (matches the iOS/Android priority table). Friend requests are **not persisted** — only the current session's unshown ids are tracked (`features/friends/presentedRequests.ts`). Free trial is offered at most once per launch and only inside a 1h window from first eligibility (`features/subscription/helpers/trialWindow.ts` `TRIAL_WINDOW_MS = 3_600_000`). Each modal screen must call `markRootModalDismissed(expectedKind)` on unmount so the queue advances — passing the wrong/no kind can free a window that belongs to a *different* still-open modal (a deep-linked `/friend/[code]` stacked over a live `/friend-request/[id]`). |
| Subscription / IAP | `src/iap/StoreService.ts`, `src/iap/purchaseFlow.ts`, `src/app/paywall.tsx`, `src/app/free-trial.tsx` | See "IAP flow" below. |
| Pro gating | `src/features/subscription/api/queries.ts useIsPro`, `PremiumGate.tsx`, `useRequirePro.ts` | Server-authoritative: `tier !== 'free'` from `GET /subscription/status` (never `/auth/me.isPro`). `false` while loading/unauthenticated — gates fail closed. |

### Routes added (Phase 4)

- `src/app/profile/index.tsx` (+ `_layout.tsx`) — profile home.
- `src/app/profile/settings.tsx`, `src/app/profile/passport.tsx`, `src/app/profile/invite.tsx` —
  settings, passport, QR invite screens.
- `src/app/profile/friends/index.tsx`, `src/app/profile/friends/[userId].tsx` — friends list and a
  single friend's profile.
- `src/app/friend/[code].tsx` — send a friend request (deep-linked from `oneplan://friend/{code}` /
  `https://{host}/friend/{code}`, replacing the Phase 2 parked placeholder).
- `src/app/friend-request/[id].tsx` — receive/respond to an incoming friend request (root-modal
  presented, or reached from the friends list' pending rows).
- `src/app/paywall.tsx` — Pro paywall (`PaywallScreen`), replacing the Phase 1/2/3 placeholder.
- `src/app/free-trial.tsx` — free-trial offer screen, root-modal presented.

### IAP flow

`src/iap/StoreService.ts` is the single owner of the `expo-iap` connection, listeners, and purchase
waiters (a module singleton, not a React context, so StoreKit/Play events — renewals, Ask-to-Buy
approvals, replayed unfinished transactions — are handled even with no paywall mounted). Port of
`ios/OnePlan/OnePlan/Services/StoreManager.swift`.

- **Validate before finish.** `finishTransaction` is **never** called before the server accepts the
  purchase: `POST /subscription/validate {jws}` on iOS, `POST /subscription/play/verify` on Android
  (`purchaseFlow.ts:83` `handlePurchase`, `StoreService.ts:118-121`). Consumables (scan packs) pass
  `isConsumable: true` only after that server OK. `appAccountToken` is attached only on
  auto-renewable purchases.
- **Waiters.** A purchase request registers a `Waiter` in a `Map<productId, Waiter>`
  (`StoreService.ts:90`) so the async `requestPurchase` call can be resolved later by the
  `purchaseUpdatedListener`. Each waiter times out after `PURCHASE_WAIT_TIMEOUT_MS` (5 minutes) and
  resolves `'pending'` rather than hanging forever if the native payment sheet wedges — a pending
  purchase, if it ever completes, is picked up by the next `init()` sweep or a manual Restore.
- **Restore / sync.** `restorePurchases` re-validates every `getAvailablePurchases()` entry against
  the server and refreshes `GET /subscription/status`; the paywall's Restore button tracks
  `RESTORE_PURCHASE_CLICKED` (`usePaywall.ts:128`).
- **Pending reconcile.** `reconcilePending()` (`StoreService.ts:298`) sweeps
  `getPendingTransactionsIOS` / unfinished Android purchases on init and after a successful
  validate, so a purchase whose original response was lost (app killed mid-flow) still gets
  finished on the next launch.
- **`StoreError` contract.** Every rejection is a `StoreError` carrying an **i18n key** plus optional
  interpolation params (`purchaseFlow.ts:32-52`); the UI renders `t(err.key, err.params)`. A raw
  server/native error string never reaches `key` directly — it's passed as the `%@` param of the
  `Purchase failed: %@` key. `useStore().error` mirrors the same `{ key, params }` shape.
- **Entitlement.** `useIsPro()` (`features/subscription/api/queries.ts:40`) derives from the
  server-authoritative `GET /subscription/status` `tier` field via `isProTier` — `false` while
  loading/unauthenticated (fail closed). `pay_once` (non-consumable) is folded into the same
  Pro check (`entitlement.ts` `isProSku`) even though it doesn't drive `SubscriptionStatus`.

### Env keys (Phase 4)

`FACEBOOK_APP_ID` is read in `app.config.ts` and exposed via `env.facebookAppId` (`src/lib/env.ts`,
`null` when unset) — required for the Instagram Stories share sheet (`native/share/instagramStories.ts`);
without it the passport share row falls back to system share / Message only. Set it as an EAS secret
for `dev`/`prod` build profiles, not committed to `.env.example`.

### Device verification

IAP purchase/restore/free-trial-eligibility and the passport's Instagram Stories handoff cannot be
verified in a simulator — they need a physical device:

- **iOS (StoreKit sandbox):** a Sandbox Apple ID signed in under Settings → App Store → Sandbox
  Account on the test device; the dev-client build must use the real bundle id (not a simulator
  build) so `isEligibleForIntroOfferIOS` / `openRedeemOfferCode` resolve against the actual
  subscription group. Purchases against the sandbox environment don't charge real money but do
  exercise the full `requestPurchase` → `purchaseUpdatedListener` → validate → `finishTransaction`
  path.
- **Android (Play license testers):** the test account must be added as a license tester on the
  Play Console listing for the target package; internal-testing track install (not a local APK)
  is required for `verifyPlayPurchase` responses to resolve real product/offer data.
- Free-trial eligibility (`useFreeTrialEligibility`) and offer-code redemption both depend on the
  store's live entitlement state, so they're owner-verified on-device, not covered by Maestro.

### What remains (owner-owned)

- Run the Phase 4 Maestro flow(s) on a real iPhone / Android device (this pass is simulator-only).
- Android Phase 4 screens are unimplemented (all Android rows in the parity checklist stay ⬜).
- Provision `FACEBOOK_APP_ID` as an EAS secret for `dev`/`prod` build profiles.
- StoreKit sandbox tester + Play license tester runs: purchase, restore, offer-code redemption, and
  free-trial eligibility, end to end on-device.
- Verify the Instagram Stories share handoff for real (simulator can't launch the Instagram app).
- Scan-credit pack purchase device verification — UI delivered in Phase 5.


## Phase 5 — Boards, extraction, and credits

Board list/detail/editor, live extraction, save-to-board/trip, trip generation, My Board location
picking, quota/purchase sheets, and shared TikTok/Instagram URLs are implemented under
`src/features/board`, `src/sse`, and `src/native/{ads,share}`. Extraction belongs to the authenticated
root lifecycle, survives screen navigation, detaches in the background, and restores from the server.
A 60-second byte-inactivity watchdog reconnects; a 10-minute attachment cap prevents endless streams.
Logout invalidates in-flight work and clears selections.

Ads use test units outside `APP_VARIANT=prod`. iOS production identifiers and SKAdNetwork entries
match the existing native app. **Android production ads are disabled**, as requested; no Android
production IDs were invented. Future enablement requires `ADMOB_ANDROID_APP_ID` and the corresponding
`ADMOB_ANDROID_REWARDED_UNIT_ID`, `ADMOB_ANDROID_END_TRIP_UNIT_ID`, `ADMOB_ANDROID_MARKET_UNIT_ID` at build time.
UMP gates initialization; iOS requests ATT only in the foreground. End-trip ads honor Pro, and the
marketplace return policy is ready for Phase 7 to call. Scan packs use the existing StoreService
validation-before-finish purchase flow.

`react-native-google-mobile-ads` is pinned to **16.0.0**: 16.5.0 resolves an Android Ads SDK compiled
with Kotlin 2.3 metadata, incompatible with this project's Kotlin 2.1 compiler. Skia's install script
is explicitly allowed in `pnpm-workspace.yaml`. New native dependencies require a rebuilt dev client.

Verification: `pnpm typecheck`, `pnpm lint`, `pnpm test --runInBand`, `pnpm api:check`,
`pnpm i18n:check`, `pnpm exec expo export --platform ios --platform android`. Native build evidence
and remaining physical-device scenarios are recorded in
`../docs/superpowers/plans/2026-09-17-rn-migration-phase5-board-pin-extraction.md`.
