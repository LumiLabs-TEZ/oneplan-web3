import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TldParser } from '@onsol/tldparser';
import { WalletProvider } from '@prisma/client';
import {
  TOKEN_2022_PROGRAM_ID,
  getMetadataPointerState,
  getTokenGroupMemberState,
  unpackMint,
} from '@solana/spl-token';
import { Connection, PublicKey } from '@solana/web3.js';

import { PrismaService } from '../prisma/prisma.service';

/** Seeker Genesis Token collection: the Token-2022 group every SGT mint is a member of (mainnet). */
export const SEEKER_GENESIS_GROUP = new PublicKey(
  'GT22s89nU4iWFkNXj1Bw6uYhJJWDRPpShHt4Bk8f99Te',
);
/** Mint authority of every SGT, per Solana Mobile's verification guide. */
export const SEEKER_GENESIS_MINT_AUTHORITY = new PublicKey(
  'GT2zuHVaZQYZSyQMgJPLzvkmyztfyXg2NJunqFp4p3A4',
);
const STALE_MS = 24 * 60 * 60 * 1000;
/** After a failed lookup, leave that user alone this long so a down RPC is not hit per request. */
export const FAILURE_BACKOFF_MS = 10 * 60_000;
/** `getMultipleAccountsInfo` takes at most 100 keys. */
const MINT_BATCH_SIZE = 100;
/** Hard cap on non-empty Token-2022 accounts inspected per lookup (10 RPC batches). */
const MAX_TOKEN_ACCOUNTS = 1000;
/** Background lookups allowed at once; extra requests are skipped, not queued. */
export const MAX_CONCURRENT_REFRESHES = 4;
/** Matches `wallet_account.skr_domain` (VarChar(64)). */
const MAX_LABEL_LENGTH = 64;

/** One address can own several .skr names; sort so the shown one never flips between calls. */
export function pickSkrLabel(domains: { domain: string }[]): string | null {
  const labels = domains
    // Reverse-lookup data can carry NUL padding, and a missing reverse account comes back
    // from tldparser as the literal "undefined.skr".
    .map((d) =>
      d.domain
        .replace(/\.skr$/, '')
        .replace(/\0/g, '')
        .trim(),
    )
    .filter(
      (label) =>
        label !== '' &&
        label !== 'undefined' &&
        label.length <= MAX_LABEL_LENGTH,
    )
    .sort();
  return labels[0] ?? null;
}

/**
 * Solana Mobile's full SGT check (sgt-verification.md). Every condition is needed: checking
 * fewer is a bypass, since any one of them can be forged on a mint someone else created.
 * Token-2022 only writes a group member with the group authority's signature.
 */
function isSeekerGenesisMint(
  mint: ReturnType<typeof unpackMint>,
  address: PublicKey,
): boolean {
  const pointer = getMetadataPointerState(mint);
  const member = getTokenGroupMemberState(mint);
  return Boolean(
    mint.mintAuthority?.equals(SEEKER_GENESIS_MINT_AUTHORITY) &&
    pointer?.authority?.equals(SEEKER_GENESIS_MINT_AUTHORITY) &&
    pointer.metadataAddress?.equals(SEEKER_GENESIS_GROUP) &&
    member?.group?.equals(SEEKER_GENESIS_GROUP) &&
    member.mint?.equals(address),
  );
}

/**
 * What a wallet row may show. Only an MWA key was linked with a Sign-In-With-Solana proof;
 * `POST /wallet/link` accepts any key, so a PRIVY row could carry someone else's Seeker
 * identity and never exposes one, whatever is stored.
 */
export function exposedIdentity(row: {
  provider: WalletProvider;
  skrDomain: string | null;
  seekerGenesisMint: string | null;
}): { skrDomain: string | null; isSeeker: boolean } {
  if (row.provider !== WalletProvider.MWA) {
    return { skrDomain: null, isSeeker: false };
  }
  return {
    skrDomain: row.skrDomain ?? null,
    isSeeker: Boolean(row.seekerGenesisMint),
  };
}

/**
 * Seeker identity for a linked wallet, read from MAINNET while money moves on devnet: the key is
 * the same on every cluster, and SGTs / .skr names only exist on mainnet. Display-only — nothing
 * here gates money or grants perks, so a stale or failed lookup is harmless.
 */
@Injectable()
export class SeekerIdentityService {
  private readonly logger = new Logger(SeekerIdentityService.name);
  private readonly connection: Connection | null;
  private readonly inFlight = new Set<number>();
  /** userId -> when its last refresh failed. In-process only; a restart just retries. */
  private readonly failedAt = new Map<number, number>();

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const url = config.get<string>('SOLANA_MAINNET_RPC_URL') || '';
    this.connection = url ? new Connection(url, 'confirmed') : null;
  }

  async findGenesisMint(owner: PublicKey): Promise<string | null> {
    if (!this.connection) return null;
    const { value } = await this.connection.getParsedTokenAccountsByOwner(
      owner,
      { programId: TOKEN_2022_PROGRAM_ID },
    );
    // A transferred-away SGT leaves an empty token account behind; it proves nothing.
    let mints = value
      .map(
        (a) =>
          (
            a.account.data.parsed as {
              info: { mint: string; tokenAmount: { amount: string } };
            }
          ).info,
      )
      .filter((info) => BigInt(info.tokenAmount.amount) > 0n)
      .map((info) => new PublicKey(info.mint));
    if (mints.length > MAX_TOKEN_ACCOUNTS) {
      this.logger.warn(
        `owner ${owner.toBase58()} holds ${mints.length} non-empty Token-2022 accounts; checking the first ${MAX_TOKEN_ACCOUNTS}`,
      );
      mints = mints.slice(0, MAX_TOKEN_ACCOUNTS);
    }
    for (let from = 0; from < mints.length; from += MINT_BATCH_SIZE) {
      const batch = mints.slice(from, from + MINT_BATCH_SIZE);
      const infos = await this.connection.getMultipleAccountsInfo(batch);
      for (let i = 0; i < batch.length; i += 1) {
        const info = infos[i];
        if (!info) continue;
        let isSgt: boolean;
        try {
          // Extension decoding can throw too (e.g. spl-token layout skew): skip only this mint.
          isSgt = isSeekerGenesisMint(
            unpackMint(batch[i], info, TOKEN_2022_PROGRAM_ID),
            batch[i],
          );
        } catch {
          continue; // Not a readable Token-2022 mint; cannot be an SGT.
        }
        if (isSgt) return batch[i].toBase58();
      }
    }
    return null;
  }

  async findSkrDomain(owner: PublicKey): Promise<string | null> {
    if (!this.connection) return null;
    const domains = await new TldParser(
      this.connection,
    ).getParsedAllUserDomainsFromTld(owner, 'skr');
    return pickSkrLabel(domains);
  }

  /** Fire-and-forget; never throws, never blocks the request that triggered it. */
  refreshInBackground(userId: number): void {
    if (!this.connection || this.inFlight.has(userId)) return;
    // No queue: a skipped user is picked up by a later request, once a slot is free.
    if (this.inFlight.size >= MAX_CONCURRENT_REFRESHES) return;
    const failed = this.failedAt.get(userId);
    if (failed !== undefined && Date.now() - failed < FAILURE_BACKOFF_MS) {
      return;
    }
    this.inFlight.add(userId);
    void this.refresh(userId)
      .then((ok) => {
        if (ok) this.failedAt.delete(userId);
        else this.failedAt.set(userId, Date.now());
      })
      .catch((error) => {
        this.failedAt.set(userId, Date.now());
        this.logger.warn(
          `identity refresh failed for user ${userId}: ${String(error)}`,
        );
      })
      .finally(() => this.inFlight.delete(userId));
  }

  /**
   * Refreshes MWA rows whose Seeker or .skr lookup is missing or older than 24h (a failed half
   * stays unchecked, so it is retried). PRIVY rows are never looked up.
   */
  refreshStaleInBackground(
    rows: {
      userId: number;
      provider: WalletProvider;
      seekerCheckedAt: Date | null;
      skrCheckedAt: Date | null;
    }[],
  ): void {
    const cutoff = Date.now() - STALE_MS;
    const stale = (checkedAt: Date | null) =>
      !checkedAt || checkedAt.getTime() < cutoff;
    for (const row of rows) {
      if (row.provider !== WalletProvider.MWA) continue;
      if (stale(row.seekerCheckedAt) || stale(row.skrCheckedAt)) {
        this.refreshInBackground(row.userId);
      }
    }
  }

  /** False when a lookup failed (that field stays unchecked), so the caller backs off. */
  private async refresh(userId: number): Promise<boolean> {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet || wallet.provider !== WalletProvider.MWA) return true;
    const owner = new PublicKey(wallet.publicKey);
    const [mint, skr] = await Promise.all([
      this.findGenesisMint(owner).catch(() => undefined),
      this.findSkrDomain(owner).catch(() => undefined),
    ]);
    const ok = mint !== undefined && skr !== undefined;
    if (mint === undefined && skr === undefined) return ok;
    const now = new Date();
    // Scoped to the key that was looked up: if the user switched wallets mid-lookup, this
    // answer belongs to the old key and must not land on the new one.
    await this.prisma.walletAccount.updateMany({
      where: {
        userId,
        publicKey: wallet.publicKey,
        provider: WalletProvider.MWA,
      },
      data: {
        ...(mint !== undefined
          ? { seekerGenesisMint: mint, seekerCheckedAt: now }
          : {}),
        ...(skr !== undefined ? { skrDomain: skr, skrCheckedAt: now } : {}),
      },
    });
    return ok;
  }
}
