/**
 * Client-side program-derived-address (PDA) derivation, so `depositFlow.ts` can
 * pin `vaultPda` against the on-chain seeds instead of trusting the server's
 * echoed `TripVaultBalanceDto` field (security audit finding S-4b: the
 * verifier must bind what the client itself can derive, not what the server
 * reports as "expected" — a compromised or buggy server could otherwise echo
 * back its own attacker-chosen vault). For the associated-token-account half
 * of that check, `deriveAssociatedTokenAddress` below is the single ATA
 * implementation (M5 of the final review: the former `web3.js`-backed twin was
 * mocked in Jest and so covered by golden vectors only — one noble-based
 * implementation now backs every caller and runs unmocked in tests).
 *
 * Reimplements `PublicKey.createProgramAddressSync`/`findProgramAddressSync`
 * from `@solana/web3.js` (same algorithm — see that package's `lib/index.cjs.js`,
 * `isOnCurve`/`createProgramAddressSync`) rather than importing the package
 * directly: `@solana/web3.js`'s single bundled entrypoint pulls in its RPC
 * `Connection` class (`jayson`, `rpc-websockets`, `node-fetch`), which fails to
 * resolve under Jest's react-native resolver (see `jest.setup.ts`'s
 * `@solana/web3.js` mock). `@noble/curves/ed25519` and `@noble/hashes/sha256`
 * are the exact same libraries `@solana/web3.js` itself uses for this, and are
 * already transitive dependencies — so this runs the identical algorithm, not
 * a shadow copy. Verified against real `@solana/web3.js` output — see
 * `pda.test.ts`'s golden vectors (computed with plain Node, which has no
 * trouble resolving the package; only Jest's RN preset does).
 */
import { ed25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha256';

import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  decodeBase58,
  encodeBase58,
  SPL_TOKEN_PROGRAM_ID,
} from './transactionVerifier';

const MAX_SEED_LENGTH = 32;
const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');

function isOnCurve(bytes: Uint8Array): boolean {
  try {
    ed25519.ExtendedPoint.fromHex(bytes);
    return true;
  } catch {
    return false;
  }
}

function concatBytes(arrays: readonly Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function createProgramAddress(seeds: readonly Uint8Array[], programId: string): Uint8Array {
  for (const seed of seeds) {
    if (seed.length > MAX_SEED_LENGTH) throw new Error('Max seed length exceeded');
  }
  const hash = sha256(concatBytes([...seeds, decodeBase58(programId), PDA_MARKER]));
  if (isOnCurve(hash)) throw new Error('Invalid seeds, address must fall off the curve');
  return hash;
}

function findProgramAddress(seeds: readonly Uint8Array[], programId: string): Uint8Array {
  for (let nonce = 255; nonce > 0; nonce -= 1) {
    try {
      return createProgramAddress([...seeds, new Uint8Array([nonce])], programId);
    } catch {
      continue;
    }
  }
  throw new Error('Unable to find a viable program address nonce');
}

/** `u64` little-endian, matching the program's `trip_id.to_le_bytes()` (Rust) / server's `u64le`. */
function u64le(value: number): Uint8Array {
  const out = new Uint8Array(8);
  new DataView(out.buffer).setBigUint64(0, BigInt(value), true);
  return out;
}

/**
 * The trip vault PDA: seeds `["vault", trip_id_le_u64]` under `programId`
 * (`solana/programs/oneplan-vault/src/instructions/init_vault.rs`,
 * `server/src/solana/solana.service.ts`'s `vaultPda`).
 */
export function deriveVaultPda(tripId: number, programId: string): string {
  const seeds = [new TextEncoder().encode('vault'), u64le(tripId)];
  return encodeBase58(findProgramAddress(seeds, programId));
}

/**
 * The Associated Token Account for `(owner, mint)`: `findProgramAddress` over
 * `[owner, tokenProgram, mint]` under the associated-token-account program — the formula every
 * SPL client uses (`getAssociatedTokenAddressSync`). Works for off-curve owners (a vault PDA).
 */
export function deriveAssociatedTokenAddress(ownerBase58: string, mintBase58: string): string {
  return encodeBase58(
    findProgramAddress(
      [decodeBase58(ownerBase58), decodeBase58(SPL_TOKEN_PROGRAM_ID), decodeBase58(mintBase58)],
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
  );
}
