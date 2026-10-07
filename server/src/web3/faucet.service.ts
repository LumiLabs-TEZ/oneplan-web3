import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';

import { PrismaService } from '../prisma/prisma.service';
import { SolanaService } from '../solana/solana.service';

/** `getGenesisHash()` of Solana devnet. Anything else means the faucet would spend real money. */
export const DEVNET_GENESIS_HASH =
  'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG';
const COOLDOWN_MS = 24 * 60 * 60 * 1000;
const USDC_DECIMALS = 6;

/**
 * Devnet test-USDC for people trying the hackathon build, so a judge can deposit without
 * hunting faucets. The server's fee payer covers fees and the recipient's token-account rent,
 * so users never need SOL.
 */
@Injectable()
export class Web3FaucetService {
  private readonly logger = new Logger(Web3FaucetService.name);
  private readonly faucet: Keypair | null;
  private readonly amountMicro: bigint;
  /** Single server instance: an in-process lock is enough to stop a double tap sending twice. */
  private readonly inFlight = new Set<number>();
  /**
   * userId -> cooldown end (ms) for claims that sent USDC but whose claim row
   * failed to write. Checked next to the DB cooldown. In-process only, like
   * `inFlight`: a restart forgets it, which the error log covers.
   */
  private readonly unrecordedClaims = new Map<number, number>();
  private clusterChecked: Promise<boolean> | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly solana: SolanaService,
  ) {
    let faucet: Keypair | null = null;
    const secret = this.config.get<string>('SOLANA_FAUCET_SECRET_KEY', '');
    if (secret) {
      try {
        faucet = Keypair.fromSecretKey(bs58.decode(secret));
      } catch {
        this.logger.error(
          'SOLANA_FAUCET_SECRET_KEY is not a valid secret key; faucet disabled',
        );
      }
    }
    this.faucet = faucet;
    this.amountMicro = BigInt(
      this.config.get<number>('FAUCET_USDC_MICRO', 5_000_000),
    );
  }

  get isEnabled(): boolean {
    const flag: unknown = this.config.get('WEB3_FAUCET_ENABLED', false);
    return (
      (flag === true || flag === 'true') &&
      this.faucet !== null &&
      this.solana.isConfigured
    );
  }

  async claim(
    userId: number,
  ): Promise<{ signature: string; amountMicro: string }> {
    if (!this.isEnabled || !this.faucet) throw new NotFoundException();
    if (this.inFlight.has(userId)) {
      throw new HttpException(
        { code: 'faucet_in_flight' },
        HttpStatus.CONFLICT,
      );
    }
    this.inFlight.add(userId);
    try {
      return await this.claimLocked(userId, this.faucet);
    } finally {
      this.inFlight.delete(userId);
    }
  }

  private async claimLocked(userId: number, faucet: Keypair) {
    if (!(await this.isDevnet())) {
      throw new ServiceUnavailableException({ code: 'faucet_wrong_cluster' });
    }
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) throw new BadRequestException({ code: 'wallet_not_linked' });

    const unrecordedUntil = this.unrecordedCooldownUntil(userId);
    if (unrecordedUntil !== null) {
      throw this.cooldown(unrecordedUntil);
    }
    const last = await this.prisma.web3FaucetClaim.findFirst({
      where: { userId, createdAt: { gte: new Date(Date.now() - COOLDOWN_MS) } },
      orderBy: { createdAt: 'desc' },
    });
    if (last) {
      throw this.cooldown(last.createdAt.getTime() + COOLDOWN_MS);
    }

    const mint = this.solana.usdcMint;
    const source = getAssociatedTokenAddressSync(mint, faucet.publicKey);
    const available = await this.solana.getTokenBalance(source).catch(() => 0n);
    if (available < this.amountMicro) {
      this.logger.warn(`faucet dry: ${available} < ${this.amountMicro}`);
      throw new ServiceUnavailableException({ code: 'faucet_empty' });
    }

    const owner = new PublicKey(wallet.publicKey);
    const destination = getAssociatedTokenAddressSync(mint, owner);
    const signature = await this.solana.sendAsFeePayer(
      [
        createAssociatedTokenAccountIdempotentInstruction(
          this.solana.feePayer.publicKey,
          destination,
          owner,
          mint,
        ),
        createTransferCheckedInstruction(
          source,
          mint,
          destination,
          faucet.publicKey,
          this.amountMicro,
          USDC_DECIMALS,
        ),
      ],
      [faucet],
    );
    try {
      await this.prisma.web3FaucetClaim.create({
        data: { userId, amountMicro: this.amountMicro, signature },
      });
    } catch (error) {
      // The transfer is already confirmed on chain: the user has the money,
      // so this is still a success. Without the row the DB cooldown cannot
      // see the claim, so hold the user off in memory instead and leave a
      // trail for recording the claim by hand.
      this.logger.error(
        `faucet claim row not recorded: userId=${userId} signature=${signature} amountMicro=${this.amountMicro}: ${String(error)}`,
      );
      this.unrecordedClaims.set(userId, Date.now() + COOLDOWN_MS);
    }
    return { signature, amountMicro: this.amountMicro.toString() };
  }

  /**
   * The in-memory cooldown left by a claim whose row could not be written.
   * Expired entries are dropped on every check so the map cannot grow past
   * the users still cooling down.
   */
  private unrecordedCooldownUntil(userId: number): number | null {
    const now = Date.now();
    for (const [id, until] of this.unrecordedClaims) {
      if (until <= now) this.unrecordedClaims.delete(id);
    }
    return this.unrecordedClaims.get(userId) ?? null;
  }

  private cooldown(nextClaimAtMs: number): HttpException {
    return new HttpException(
      {
        code: 'faucet_cooldown',
        nextClaimAt: new Date(nextClaimAtMs).toISOString(),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private isDevnet(): Promise<boolean> {
    this.clusterChecked ??= this.solana.connection
      .getGenesisHash()
      .then((hash) => hash === DEVNET_GENESIS_HASH)
      .catch(() => {
        this.clusterChecked = null; // retry next time; never cache a network failure
        return false;
      });
    return this.clusterChecked;
  }
}
