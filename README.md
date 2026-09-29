# OnePlan — group trips with a shared Solana USDC vault

OnePlan is a group trip planner (itinerary, expenses, bill splitting, chat) with a **Solana USDC group vault**. Trip members fund a shared on-chain wallet, pay merchants by scanning a local QR code (VietQR), approve large spends together, and settle what is left when the trip ends. Merchant payments are off-ramped to local fiat (VND) through a payout provider.

> Hackathon submission (Solana Mobile). This repo is a snapshot of the web3 work; the full product also has a marketplace, board and subscription side that is out of scope here.

## Architecture

```
 Expo / React Native app (mobile/)
   │  Privy embedded wallet (Solana)
   │  REST + JWT
   ▼
 NestJS API (server/) ──── PostgreSQL (Prisma)
   │   trip-vault: vault sync, pay, settlement, reconcile crons
   │   payout:     VietQR parsing + payout provider (mock)
   │  @solana/web3.js, server fee payer
   ▼
 Anchor program oneplan-vault (solana/) on Solana devnet
   USDC vault per trip · member roles · spend / propose / approve · settlement
```

## Repo layout

```
solana/    Anchor program `oneplan-vault` (Rust) + tests
server/    NestJS + Fastify + Prisma API
mobile/    Expo SDK 57 React Native app (iOS + Android)
openapi/   Generated OpenAPI spec used by mobile (`pnpm api:gen`)
```

## Where the off-ramp payment logic lives

| Piece | Location |
|---|---|
| QR parsing (VietQR / EMVCo) | `server/src/payout/vietqr.ts` |
| Payout provider interface + mock | `server/src/payout/` |
| Pay-a-merchant flow, claim/idempotency, failure codes | `server/src/trip-vault/trip-vault-pay.service.ts`, `payout-claim.ts`, `vault-failure-codes.ts` |
| Reconcile of unknown / timed-out payouts | `server/src/trip-vault/trip-vault-reconcile.service.ts` |
| Settlement at trip end | `server/src/trip-vault/trip-vault-settlement.service.ts`, `settlement-math.ts` |
| On-chain instructions | `solana/programs/oneplan-vault/src/` — `spend`, `revert_spend`, `propose_spend`, `approve_spend`, `cancel_spend`, `execute_settlement`, `payout_leave` |

Flow: the app scans a QR → the server validates it and creates a payout claim → the program's `spend` moves USDC from the trip vault to the treasury (large amounts go through `propose_spend` / `approve_spend` first) → the payout provider pays the merchant in VND → on failure the server calls `revert_spend` so the funds return to the vault.

## Build and run

### Program (`solana/`)

Requires Rust (see `rust-toolchain.toml`) and the Anchor CLI.

```bash
cd solana
anchor build
cargo test
```

Devnet program id: `HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL`

### Server (`server/`)

```bash
cd server
pnpm install
pnpm prisma:generate        # if the postinstall step was skipped
pnpm db:up                  # PostgreSQL in Docker on localhost:5433
cp .env.example .env        # fill in values
pnpm prisma:migrate:dev
pnpm start:dev              # http://localhost:3000, Swagger at /docs
pnpm build
npx jest --testPathPatterns='solana|trip-vault|payout'
```

Minimum env vars to boot: `PORT`, `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET` (≥32 chars each), `APPLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `GCS_MEDIA_BUCKET`, `GCS_PUBLIC_BUCKET`, `STORAGE_SA_KEY_FILE`. The Joi schema in `src/config/` lists everything.

Web3 vars:

| Var | Purpose |
|---|---|
| `WEB3_ENABLED` | Master switch for vault endpoints, crons and vault sync on join (default `false`) |
| `SOLANA_RPC_URL` | `https://api.devnet.solana.com` |
| `SOLANA_PROGRAM_ID` | `HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL` (devnet) |
| `SOLANA_USDC_MINT` | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (devnet USDC) |
| `SOLANA_COMMITMENT` | `confirmed` |
| `SOLANA_FEE_PAYER_SECRET_KEY` | base58 key of the server fee payer; generate your own and fund it with devnet SOL |
| `SOLANA_RECEIVER_SECRET_KEY` | mock merchant receiver |
| `SOLANA_TREASURY_OWNER` | treasury owner pubkey |
| `MOCK_PAYOUT_OUTCOME` | `success \| failed \| timeout \| unknown` |
| `WALLET_JWT_PRIVATE_KEY_FILE` | PEM used to sign embedded-wallet JWTs |

No keys are committed to this repo.

### Mobile (`mobile/`)

```bash
cd mobile
pnpm install
cp .env.example .env
pnpm typecheck
CI=1 npx jest --watchman=false features/vault
npx expo run:ios   # or run:android — needs an Expo dev client, not Expo Go
```

`APP_VARIANT=local|dev|prod` selects bundle id and default API URL; override the backend with `API_URL` (for example your local server). App code reads env only through `src/lib/env.ts`. Android push needs a Firebase `google-services.json`, which is not in this repo: set `GOOGLE_SERVICES_JSON=/path/to/file` to enable it; the app builds without it.

## Honest status

- **Devnet only.** Nothing here has been deployed to mainnet.
- **The payout provider is a mock** (`MOCK_PAYOUT_OUTCOME`); no real fiat leaves the system.
- **Program hardening is in progress.** An internal security review is under way and fixes will land before any mainnet use. Do not put real funds in this program.
- Web3 features are gated server-side; the default configuration has them off (`WEB3_ENABLED=false`). When enabled, eligibility is decided per request by the server (region-based), and each trip is fixed as web3 or classic at creation.

## License

TODO: license (operator to choose)
