import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { PublicKey, type ParsedTransactionWithMeta } from '@solana/web3.js';

import { PrismaService } from '../prisma/prisma.service';
import { SolanaService } from '../solana/solana.service';
import { WalletHistoryEntryDto } from './dto/wallet-history.dto';

/** Circle USDC has six decimals, and transferChecked is told so on purpose. */
const USDC_DECIMALS = 6;

/** Recipient token accounts one member may make the fee payer open per day. */
const MAX_NEW_RECIPIENT_ACCOUNTS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Cap how far back we scan so a busy ATA cannot blow the RPC budget. */
const HISTORY_SIGNATURE_LIMIT = 40;

/**
 * Moves USDC out of a member's own wallet to an address they name.
 *
 * Nothing here touches the vault program: this is one token transfer between
 * two wallets. The care it needs is not on the chain but before it — a
 * mistyped address that happens to be valid takes the money with it, and no
 * part of this system can bring it back.
 */
@Injectable()
export class WalletWithdrawService {
  private readonly logger = new Logger(WalletWithdrawService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly solana: SolanaService,
    private readonly config: ConfigService,
  ) {}

  private assertConfigured(): void {
    if (!this.solana.isConfigured) {
      throw new ServiceUnavailableException(
        'Solana is not configured on this server',
      );
    }
  }

  /**
   * Checks an address the member pasted, before any amount is chosen.
   *
   * `isNew` is the one hint worth giving. An address that has never held USDC
   * is usually a fresh wallet and sometimes a typo, and the difference cannot
   * be known from here — so it is reported rather than judged.
   */
  async inspectRecipient(
    address: string,
  ): Promise<{ address: string; isNew: boolean }> {
    const recipient = this.parseAddress(address);
    const ata = getAssociatedTokenAddressSync(this.solana.usdcMint, recipient);
    try {
      await getAccount(this.solana.connection, ata);
      return { address: recipient.toBase58(), isNew: false };
    } catch {
      return { address: recipient.toBase58(), isNew: true };
    }
  }

  /**
   * Recent USDC transfers on the caller's personal ATA, read from chain.
   *
   * There is no app DB for personal deposits (they arrive from outside) and
   * withdrawals are not persisted either — the ATA ledger is the source of
   * truth. Parsed here so the iOS client never talks to an RPC key.
   *
   * Helius free tier rejects multi-signature `getParsedTransactions` batches
   * (403), so each signature is fetched with `getParsedTransaction`. A failed
   * fetch is skipped rather than failing the whole page.
   */
  async getHistory(userId: number): Promise<WalletHistoryEntryDto[]> {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) {
      return [];
    }

    const owner = new PublicKey(wallet.publicKey);
    const ata = getAssociatedTokenAddressSync(this.solana.usdcMint, owner);
    const mint = this.solana.usdcMint.toBase58();
    const ownerKey = owner.toBase58();
    const ataKey = ata.toBase58();

    let signatures: Awaited<
      ReturnType<typeof this.solana.connection.getSignaturesForAddress>
    >;
    try {
      signatures = await this.solana.connection.getSignaturesForAddress(ata, {
        limit: HISTORY_SIGNATURE_LIMIT,
      });
    } catch (error) {
      this.logger.warn(`wallet history signatures failed: ${error}`);
      return [];
    }
    if (signatures.length === 0) {
      return [];
    }

    const entries: WalletHistoryEntryDto[] = [];
    for (const sig of signatures) {
      let tx: ParsedTransactionWithMeta | null;
      try {
        tx = await this.solana.connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
      } catch (error) {
        this.logger.warn(`wallet history tx ${sig.signature}: ${error}`);
        continue;
      }
      if (!tx || tx.meta?.err) {
        continue;
      }
      const parsed = this.parseUsdcDelta(tx, ataKey, mint, ownerKey);
      if (!parsed) {
        continue;
      }
      const createdAt =
        sig.blockTime != null
          ? new Date(sig.blockTime * 1000).toISOString()
          : '';
      entries.push({
        id: sig.signature,
        kind: parsed.kind,
        address: parsed.counterparty,
        amountMicro: parsed.amountMicro.toString(),
        blockTime: String(sig.blockTime ?? 0),
        createdAt,
      });
    }
    return entries;
  }

  /**
   * Builds the transfer for the member to sign.
   *
   * The fee payer is this server, as it is everywhere else — a member holding
   * only USDC has no SOL to spend, which is the whole reason they can use the
   * app at all. That extends to opening the recipient's token account when it
   * does not exist yet.
   */
  async buildWithdrawal(
    userId: number,
    address: string,
    amountMicro: bigint,
  ): Promise<{ base64Tx: string; createsRecipientAccount: boolean }> {
    this.assertConfigured();
    if (amountMicro <= 0n) {
      throw new BadRequestException('Enter an amount to withdraw');
    }
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new NotFoundException('You do not have a wallet yet');
    }

    const owner = new PublicKey(wallet.publicKey);
    const recipient = this.parseAddress(address);
    if (recipient.equals(owner)) {
      throw new BadRequestException('That is this wallet');
    }

    // A floor makes the fee payer's ~0.002 SOL of rent per new recipient
    // account cost the requester real money (S9: 1-micro withdrawals to fresh
    // addresses were a free SOL drain on the operator).
    const minMicro = BigInt(
      this.config.get<number>('WALLET_WITHDRAW_MIN_MICRO', 1_000_000),
    );
    if (amountMicro < minMicro) {
      throw new BadRequestException(
        `The minimum withdrawal is ${minMicro} micro-USDC`,
      );
    }

    const from = getAssociatedTokenAddressSync(this.solana.usdcMint, owner);
    const to = getAssociatedTokenAddressSync(this.solana.usdcMint, recipient);

    const balance = await this.solana.getTokenBalance(from);
    if (amountMicro > balance) {
      throw new BadRequestException('That is more than this wallet holds');
    }

    const instructions = [];
    let createsRecipientAccount = false;
    try {
      await getAccount(this.solana.connection, to);
    } catch {
      createsRecipientAccount = true;
      instructions.push(
        createAssociatedTokenAccountInstruction(
          this.solana.feePayer.publicKey,
          to,
          recipient,
          this.solana.usdcMint,
        ),
      );
    }

    instructions.push(
      createTransferCheckedInstruction(
        from,
        this.solana.usdcMint,
        to,
        owner,
        amountMicro,
        USDC_DECIMALS,
      ),
    );

    const base64Tx = await this.solana.buildUnsignedTx(instructions);
    await this.reserveWithdrawal(userId, amountMicro, createsRecipientAccount);
    return { base64Tx, createsRecipientAccount };
  }

  /**
   * Books the withdrawal against the member's rolling 24h allowance, or throws.
   * Counted when the transaction is built, not when it lands: the drain is the
   * ATA rent the fee payer spends on submit, and an abandoned build that keeps
   * counting is the cheap side of that trade. Serialised per user so parallel
   * builds cannot each slip under the cap.
   */
  private async reserveWithdrawal(
    userId: number,
    amountMicro: bigint,
    createsRecipientAccount: boolean,
  ): Promise<void> {
    const capMicro = BigInt(
      this.config.get<number>('WALLET_WITHDRAW_DAILY_CAP_MICRO', 1_000_000_000),
    );
    const since = new Date(Date.now() - DAY_MS);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${userId})`;
      const recent = await tx.walletWithdrawal.findMany({
        where: { userId, createdAt: { gte: since } },
        select: { amountMicro: true, createsRecipientAccount: true },
      });
      const total = recent.reduce((sum, row) => sum + row.amountMicro, 0n);
      if (total + amountMicro > capMicro) {
        throw new BadRequestException(
          'Daily withdrawal limit reached; try again later',
        );
      }
      const newAccounts = recent.filter((r) => r.createsRecipientAccount);
      if (
        createsRecipientAccount &&
        newAccounts.length >= MAX_NEW_RECIPIENT_ACCOUNTS_PER_DAY
      ) {
        throw new BadRequestException(
          'Too many withdrawals to new addresses today; try again later',
        );
      }
      await tx.walletWithdrawal.create({
        data: { userId, amountMicro, createsRecipientAccount },
      });
    });
  }

  /** Sends the signed transfer and reports what the chain did with it. */
  async submitWithdrawal(
    signedTx: string,
  ): Promise<{ signature: string; status: string }> {
    this.assertConfigured();
    const signature = await this.solana.broadcastSigned(signedTx);
    try {
      await this.solana.confirmSigned(signedTx, signature);
      return { signature, status: 'CONFIRMED' };
    } catch (error) {
      // The transfer is on the chain; only the answer went missing. Calling
      // that a failure would tell someone their money is still theirs while it
      // is on its way to somebody else.
      this.logger.warn(`withdrawal ${signature} not confirmed yet: ${error}`);
      return { signature, status: 'PENDING' };
    }
  }

  /**
   * A Solana address, or a clear reason why it is not one.
   *
   * The message names the mistake people actually make: pasting an address
   * from a chain this wallet has never been on. Sending USDC to one is
   * irreversible and silent, so it is worth refusing by name.
   */
  private parseAddress(address: string): PublicKey {
    const trimmed = address.trim();
    if (trimmed.startsWith('0x')) {
      throw new BadRequestException(
        'That is an Ethereum address. This wallet is on Solana.',
      );
    }
    try {
      const key = new PublicKey(trimmed);
      if (!PublicKey.isOnCurve(key.toBytes())) {
        // Off-curve keys are program addresses. Nobody holds their keys, so
        // USDC sent to one is gone.
        throw new Error('off curve');
      }
      return key;
    } catch {
      throw new BadRequestException('That is not a Solana wallet address');
    }
  }

  /**
   * Reads the USDC balance delta on `owner`'s balances from pre/post token
   * balances and picks a counterparty owner from the other side of the same
   * mint change.
   */
  private parseUsdcDelta(
    tx: ParsedTransactionWithMeta,
    ata: string,
    mint: string,
    owner: string,
  ): {
    kind: 'deposit' | 'withdraw';
    amountMicro: bigint;
    counterparty: string;
  } | null {
    const meta = tx.meta;
    if (!meta) {
      return null;
    }

    const pre = meta.preTokenBalances ?? [];
    const post = meta.postTokenBalances ?? [];
    const preOurs = pre.find((b) => b.mint === mint && b.owner === owner);
    const postOurs = post.find((b) => b.mint === mint && b.owner === owner);
    const preAmt = BigInt(preOurs?.uiTokenAmount.amount || '0');
    const postAmt = BigInt(postOurs?.uiTokenAmount.amount || '0');
    const delta = postAmt - preAmt;
    if (delta === 0n) {
      return null;
    }

    const kind: 'deposit' | 'withdraw' = delta > 0n ? 'deposit' : 'withdraw';
    const amountMicro = delta < 0n ? -delta : delta;

    const others = new Map<string, bigint>();
    for (const b of pre) {
      if (b.mint !== mint || b.owner == null || b.owner === owner) continue;
      others.set(b.owner, BigInt(b.uiTokenAmount.amount));
    }
    for (const b of post) {
      if (b.mint !== mint || b.owner == null || b.owner === owner) continue;
      const before = others.get(b.owner) ?? 0n;
      const after = BigInt(b.uiTokenAmount.amount);
      others.set(b.owner, after - before);
    }
    let counterparty = '';
    for (const [other, otherDelta] of others) {
      if (kind === 'deposit' && otherDelta < 0n) {
        counterparty = other;
        break;
      }
      if (kind === 'withdraw' && otherDelta > 0n) {
        counterparty = other;
        break;
      }
    }
    if (!counterparty) {
      const keys = tx.transaction.message.accountKeys.map((k) =>
        typeof k === 'string' ? k : k.pubkey.toBase58(),
      );
      counterparty = keys.find((k) => k !== owner && k !== ata) ?? owner;
    }

    return { kind, amountMicro, counterparty };
  }
}
