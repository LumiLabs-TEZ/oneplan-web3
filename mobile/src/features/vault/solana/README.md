# Vault Solana primitives

Pure-TS port of the client security primitives from
`ios/OnePlan/OnePlan/Services/Solana/*.swift` (branch `feat/web3-version`). No
React, no native modules — safe to unit test in plain Jest and to run inside
the RN JS thread before a wallet ever signs anything.

## What this guarantees

- **`transactionVerifier.verify()` / `verifyTokenTransfer()`**: decode a
  base64 legacy Solana transaction and refuse to let the wallet sign it unless
  it contains *exactly one* instruction, against the expected program id,
  Anchor discriminator (or SPL `transferChecked` tag), amount, mint, and
  account set. The server builds every transaction the app signs; this is
  what stops a compromised or buggy server from handing back a transaction
  that drains the vault while the UI still shows the amount and recipient
  the user agreed to.
- **`shortVec.decodeShortVec()`**: walks Solana's compact-u16 length prefix
  (used throughout the wire format `transactionVerifier` decodes).
- **`vietqr.decodeVietQr()`**: parses a scanned VietQR EMVCo payload
  client-side, so an unrecognised code never leaves the phone — only the
  bank BIN, account number, and (if present) amount/description the payment
  flow understands are sent onward.
- **`constants.ts`**: the program id and per-instruction Anchor
  discriminators the verifier checks against. These are **hard-coded on
  purpose** — taking them from the server would make the check circular
  (the server is exactly what this code doesn't trust).

## What this does NOT protect against

- **Anything about the recipient being who they claim to be.** This is a
  wire-format / instruction-shape check, not an identity check.
- **Versioned transactions.** Legacy format only — the server is constrained
  to build legacy transactions specifically so this stays this short.
  Versioned transactions add address lookup tables, and resolving those
  would mean fetching on-chain accounts before it's safe to sign.
- **Anything after signing.** This runs before `WalletService.sign()`; it
  says nothing about broadcast, confirmation, or settlement.

## Fixed vs Swift (intentional, documented divergence)

Two gaps were found while porting and were originally left as-is (findings,
not silent fixes) because "port the Swift client" doesn't license behavioural
changes on its own authority. Both were then explicitly requested as fixes
and applied here — they are **not** what the iOS app does today, so treat
`ios/OnePlan` as stale on these two points until it's ported forward too:

1. **`verifyTokenTransfer()` now checks the mint account.** A token
   transfer's accounts are `[source, mint, destination, owner]`. The Swift
   original (and this port, until now) checked *program*, *amount*,
   *decimals*, *destination*, and *owner*, but never `accountKeys[1]`
   (mint) — so a transaction moving the right amount to the right
   destination/owner via a *different* SPL token would still have passed.
   `verifyTokenTransfer` now throws `argumentMismatch('mint')` unless index 1
   equals `VAULT_USDC_MINT` (`constants.ts`).
2. **VietQR amount parsing now matches the server's rule exactly.** The
   Swift original only validated the digits before the first `.` in the
   amount field and silently discarded everything after — so
   `"200000.notanumber"` decoded to `200000`, and a bare trailing dot
   (`"200000."`) was accepted. `decodeVietQr` now applies the same pattern
   as `server/src/payout/vietqr.ts` (`feat/web3-version`) —
   `/^\d+(\.\d+)?$/` — so the client and server never disagree on whether a
   scanned amount string is valid.

Neither change touches account/instruction *presence* logic (the reason this
module exists) — both narrow what was already accepted, so there's no way
for a previously-rejected transaction/QR code to now pass.

## Updating constants after a redeploy

The vault program will be redeployed under a new program id, and a running
security audit may change account layouts. When that lands, edit
`constants.ts` only:

1. Set `VAULT_PROGRAM_ID` from the new IDL's top-level `address`.
2. If the deployment also points at a different USDC mint, update
   `VAULT_USDC_MINT` to match `SOLANA_USDC_MINT` on the server — otherwise
   every personal-wallet payment will fail `verifyTokenTransfer`'s mint check.
3. Re-copy every entry in `VAULT_DISCRIMINATORS` from the new IDL's
   `instructions[].discriminator` — don't hand-derive them (an Anchor
   discriminator is `sha256("global:<instruction_name>")` truncated to 8
   bytes; a typo here silently defeats the check).
4. If any instruction's account list changed shape in the new IDL, re-check the
   `expectedAccounts` each caller assembles (`signing/depositFlow.ts`, `api/pay.ts`) — the
   verifier only checks that those accounts are *present*, so a mismatch won't fail loudly.

No other file in this module should need to change for a redeploy.
