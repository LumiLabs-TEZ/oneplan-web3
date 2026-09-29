# oneplan-vault deployment

## Devnet — current (deployed 2026-09-29)

- Program Id: `HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL`
  (keypair at `~/.config/solana/oneplan-vault-program-devnet.json`, mode 600, outside the repo;
  copied to `solana/target/deploy/oneplan_vault-keypair.json` for builds — `target/` is gitignored)
- Upgrade authority + payer: `D2iUy5Cka4MEBRtFidRwLMrSv8xttss3P8Fntaq8Qhcx`
  (keypair at `~/.config/solana/oneplan-devnet-authority.json`, mode 600)
- Deployed: 2026-09-29, slot 505574640
  (tx `4JdVrJWDAMmZ2q6TCNuA7CkMa9cq9BnFStnoHJN5zT4oCi4Jryfmj8dG9m4CupwtQLhjXe9WBar1gJhbbhDdLHA2`)
- ProgramData: `3tLq4NaubpF7SvWEGw4PM3VLSpmtkgnKJYGZxvXvpV5q` (data length 346224, rent 1.75969676 SOL)
- IDL initialized on chain via `anchor idl init`.
- Code is the UNCHANGED audited-baseline program; hardening lands later as an in-place upgrade.

## Superseded (history)

- `8pjmDZvmRzjcSwzffqnsdzsPRb3nV9BiVDhGU3vmR7uD` — ABANDONED: its upgrade authority
  (`Hzr7ax7coiXXWqP9yQhQwphdv4YmLpVD1QZhYnNhcZSL`) was lost (audit INF-1), so it can never be
  upgraded or closed. Deployed 2026-08-11, upgraded 2026-08-12 and 2026-08-13; on-chain IDL
  metadata account `9tg9LGtiy9q5CKZTjmGLJsGe635P81nYm3e8WLvbnH9y`.
- `7VuQyRnDxkw7im17eXxTEdbTXRqUkZFVHcGmPqRYNbkL` — earlier superseded program.

The rent balance is a refundable deposit, not a fee. `solana program close`
returns it (only possible while you hold the upgrade authority).

## Server configuration

    SOLANA_CLUSTER=devnet
    SOLANA_RPC_URL=https://api.devnet.solana.com
    SOLANA_PROGRAM_ID=HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL

Devnet USDC mint: `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`.

The server bundles the IDL (`server/src/solana/idl/oneplan_vault.json`). When cutting over,
change `SOLANA_PROGRAM_ID` in the VPS `.env` (dev and prod) — nothing else server-side.

## Verifying

    export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
    solana program show HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL --url devnet

## First deploy of the new id (already run 2026-09-29; kept for reference)

    export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
    cd solana
    unset CARGO_TARGET_DIR
    anchor build
    solana-keygen pubkey target/deploy/oneplan_vault-keypair.json   # must print HcBimMiX…rLAL
    solana program deploy target/deploy/oneplan_vault.so --url devnet \
      --program-id ~/.config/solana/oneplan-vault-program-devnet.json \
      --keypair ~/.config/solana/oneplan-devnet-authority.json \
      --upgrade-authority ~/.config/solana/oneplan-devnet-authority.json
    anchor idl init HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL \
      -f target/idl/oneplan_vault.json --provider.cluster devnet
    solana program show HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL --url devnet

(`anchor deploy --provider.cluster devnet` is equivalent; `Anchor.toml` already points the
provider wallet at the authority keypair.)

Cost: the `.so` is 346,224 bytes → `solana rent 346224` = 1.759 SOL, held twice at peak
(buffer + program-data account; the buffer's rent is refunded when the deploy completes).
Fund the authority with ~4 SOL for headroom; net cost after deploy ≈ 1.77 SOL, plus a small
amount for the IDL account. Later upgrades cost only transaction fees (plus rent if the
program grows).

## Redeploying / upgrading

    anchor build
    anchor upgrade target/deploy/oneplan_vault.so --program-id HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL \
      --provider.cluster devnet
    anchor idl upgrade HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL -f target/idl/oneplan_vault.json --provider.cluster devnet

The program id is fixed by the program keypair
(`~/.config/solana/oneplan-vault-program-devnet.json`). Back it up: it is only needed for the
first deploy, but losing the upgrade-authority keypair makes the program unupgradeable
(that is how `8pjm…` was lost).

## Funding the deployer

`solana airdrop` against `api.devnet.solana.com` is heavily rate limited and
usually fails. Use https://faucet.solana.com with the deployer address instead.
A first deploy needs ~1.8 SOL net (~3.6 SOL peak); upgrades cost only transaction fees.
