# Vault UI kit

Shared, pure-presentational styling primitives for the web3 vault screens (waves A–E), ported at
visual parity from `ios/OnePlan/OnePlan/Component/Vault/*.swift` on `feat/web3-version`. Every
component here is props-in / callbacks-out — no data fetching, no service calls — so later waves
compose them instead of re-deriving the chrome.

## Components

### `VaultPalette.ts`

Mirrors `VaultPalette.swift`: `accent` (the sky-blue Scan QR / Done colour), `scanFrame` (the
scanner viewfinder), `headerChip` (the translucent chip fill). Swift draws these with Liquid
Glass, which lightens whatever tint it receives; RN has no Liquid Glass, so these render as flat
colour — see the `AccentButton` note under `TripVaultCard.tsx` below.

### `VaultHeaderChip.tsx`

Mirrors `VaultHeaderChip.swift`'s `View` modifier as a wrapping component: `cornerRadius` (default
16) and `overCamera` (flat fill + shadow on a page vs. translucent blur + hairline border over a
camera feed). Figma: header chips throughout the vault screens (e.g. `4251:...` back/balance
chips referenced by the individual screens that use it).

Known gap: Swift also flips `\.colorScheme` to `.dark` for the `overCamera` variant so its
content (SF Symbols, system-coloured text) renders light automatically. RN has no such
environment propagation — a caller passing `overCamera` must give its children light colours
itself. The only Swift consumer (`VaultScanQRView`) is Wave B, out of this task's scope, so this
is documented rather than fixed here.

### `useAmountDigits.ts` + `AmountKeypad.tsx`

Mirrors `AmountKeypad.swift`. `useAmountDigits(allowsDecimal, initial?)` is the entry state
machine (`digits`, `append`, `delete`, `clear`, `setDigits`); `AmountKeypad` is the 4×3 grid that
calls `onAppend`/`onDelete`. Swift rule → test mapping is in `useAmountDigits.test.ts`'s header
comment.

Distinct from `@/ui/components/AmountKeypad` (the classic expense-sheet keypad, which is driven by
`keypadReducer` + a `Currency`'s `decimalPlaces` and shows a "DEL" text label). This one takes a
plain `allowsDecimal` boolean like its Swift counterpart, fully **hides** the dot key rather than
disabling-but-showing it (`Swift: .opacity(allowsDecimal ? 1 : 0)`), and draws a delete *icon*
(`SFSymbol name="delete.left"`) instead of text. There is no maximum digit length in either the
Swift view or this port — Swift callers (e.g. `ContributeToVaultView.microUSDC(from:)`) cap the
*fraction* to 6 digits only when converting the typed string to micro-USDC, which is out of this
component's scope.

### `CategoryIcon.tsx`

Mirrors `CategoryIcon.swift`: draws the 12 categories with a Figma illustration, and falls back to
an emoji for the 2 that don't have one (`PARK` → 🌵, `OTHER` → 🧾 — the mockup's last rows sit
outside the sheet).

**Discovery while porting:** the vault-specific per-category PNGs were pixel-identical to the
illustrations already wired into `@/ui/assets` `svg.categories` for the classic expense flow, so
`CategoryIcon.tsx` reuses `svg.categories` directly and the duplicate PNGs were deleted (final-review
M9).

### `TripVaultCard.tsx`

Mirrors `TripVaultCard.swift` — the Group Balance card shown at the top of a web3 trip, in place
of the classic `HomeCard`. Figma: `4016:14636` (button row).

Copies `@/features/trip/components/HomeCard`'s chrome on purpose (per the Swift doc comment): same
32pt radius, same dashed white rim, same `cardBackground` cover image, same
`CurrencyDisplayField`-shaped balance block (label 14 / symbol+amount 36, symbol dimmed to 30%) —
so a trip's card doesn't visibly change shape when it gains a vault. The `cardBackground` PNG's
native size (369×303) is exactly this card's own artboard, so unlike `HomeCard` (290pt tall, which
crops the same asset) this one draws it uncropped.

Props: `tripName`, `coverImageUrl?`, `balance` (home-currency value), `currency` (a currency code
string **or** an already-resolved `@/lib/currency` `Currency` — either works), `balanceUsdc`,
`isWaitingForEndApproval?` (swaps Deposit/Scan QR for a single "Waiting for approval" CTA),
`onDeposit?`/`onScanQR?`/`onWaitingForApproval?`.

Deliberately **omits** Swift's `needsEndTripReview` prop: in the Swift source it is declared but
never read inside `TripVaultCard`'s own body — the button label is always "Waiting for approval"
(comment: "tap still routes to review vs waiting via `needsEndTripReview`"), i.e. that routing
decision belongs entirely inside the caller's `onWaitingForApproval` closure, not to data the card
itself needs. A later wave's screen keeps that boolean and decides where to route on tap.

`AccentButton` (Scan QR / Waiting for approval) renders the *non*-Liquid-Glass fallback Swift
itself falls back to below iOS 26 (`ProminentCapsuleFallbackStyle`: a solid `VaultPalette.accent`
capsule + tinted shadow) — RN has no native Liquid Glass at all, and this is the same flattened
"prominent button" shape every other RN `Button variant="primary"` in this codebase already
renders, so no new dependency was needed.

## Currency: `formatUsdc` (`@/lib/currency.ts`)

Added alongside the existing `CurrencyFormatter` — port of `CurrencyFormatter.formatUsdc` (Swift,
web3 branch). Always 2 fraction digits, comma-grouped, half-away-from-zero rounding. Exists
because the fiat 2-decimal split (`formatWhole` + `formatDecimal`) turns `0.999` into `"0"` +
`".100"` (three digits) instead of carrying the rounded cent into the whole part —
`formatUsdc(0.999)` correctly returns `"1.00"`. See `currency.test.ts`'s `formatUsdc` block.

## Verified on Android emulator (`APP_VARIANT=local`)

Built/installed on a `Medium_Phone_API_36.1` AVD and viewed at `(dev)/vault-kit` (gallery since removed). Screenshots
saved under `/tmp/vault-kit-*.png` during the porting session: `13-deeplink` (palette, header
chip x2, VND keypad), `14-scroll1`/`15-scroll2`/`16-scroll3` (USDC keypad, all 14 category icons,
every `TripVaultCard` state), `19-vi-card` (Vietnamese strings via the gallery's EN/VI toggle).

Known deltas vs. the Swift originals, all deliberate and documented inline where they occur:

- `VaultHeaderChip overCamera`: Swift auto-flips `\.colorScheme` to `.dark` so its content
  renders light; RN has no such propagation, so a caller must pass light-coloured children
  itself (only Swift consumer is Wave B, out of scope here).
- `AmountKeypad` delete key: Android draws the `SFSymbol` Ionicons fallback (`backspace-outline`)
  instead of the true SF Symbol `delete.left` glyph — same glyph swap every other `SFSymbol` call
  site in this codebase already makes.
- `TripVaultCard`'s accent buttons (Scan QR / Waiting for approval): flat tinted capsule, not
  Liquid Glass — RN has none, and this matches the same non-glass fallback Swift itself draws
  below iOS 26 / that Android already renders for every other "prominent" button in the app.
- `CategoryIcon` draws the pre-existing `svg.categories` illustrations (200px raster); the
  pixel-identical vault-specific PNGs were removed as duplicates.

No other visual deltas found against the Swift source (spacing, colours, truncation, rounding,
and empty/waiting/long-name states all matched on device).

## Swift file → RN file map

| Swift (`feat/web3-version`) | RN |
|---|---|
| `Component/Vault/VaultPalette.swift` | `VaultPalette.ts` |
| `Component/Vault/VaultHeaderChip.swift` | `VaultHeaderChip.tsx` |
| `Component/Vault/AmountKeypad.swift` | `useAmountDigits.ts` + `AmountKeypad.tsx` |
| `Component/Vault/CategoryIcon.swift` | `CategoryIcon.tsx` (reuses `@/ui/assets` `svg.categories`) |
| `View/Vault/TripVaultCard.swift` | `TripVaultCard.tsx` |
| `Component/Common/Currency/CurrencyFormatter.swift` (`formatUsdc` addition) | `@/lib/currency.ts` `formatUsdc` |
