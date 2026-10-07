import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import BN from 'bn.js';
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  Commitment,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionExpiredBlockheightExceededError,
  TransactionInstruction,
} from '@solana/web3.js';
import bs58 from 'bs58';

import {
  DEFAULT_SOLANA_COMMITMENT,
  DEFAULT_SOLANA_RPC_URL,
  DEFAULT_SOLANA_USDC_MINT,
} from './solana.config';
import idl from './idl/oneplan_vault.json';
import type { OneplanVault } from './types/oneplan_vault';

const VAULT_SEED = Buffer.from('vault');

function u64le(value: number | bigint): Buffer {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(BigInt(value));
  return buf;
}

/// A blockhash is valid for 150 blocks. Used to bound the confirmation wait
/// when the transaction's own blockhash is what we are confirming against.
const BLOCKHASH_VALIDITY_BLOCKS = 150;

/** Error code for a signed transaction whose blockhash expired before broadcast. */
export const TX_EXPIRED_CODE = 'tx_expired';

/**
 * The RPC's ways of saying the transaction's blockhash is gone: preflight
 * simulation ("Blockhash not found"), the send error name (BlockhashNotFound),
 * and the block-height expiry.
 */
const EXPIRED_BLOCKHASH_PATTERN =
  /blockhash not found|blockhashnotfound|block ?height exceeded/i;

function isExpiredBlockhashError(error: unknown): boolean {
  if (error instanceof TransactionExpiredBlockheightExceededError) {
    return true;
  }
  return (
    error instanceof Error && EXPIRED_BLOCKHASH_PATTERN.test(error.message)
  );
}

/** Whether `error` is the 409 `tx_expired` thrown by `broadcastSigned`. */
export function isTxExpired(error: unknown): boolean {
  if (!(error instanceof ConflictException)) {
    return false;
  }
  const body = error.getResponse();
  return (
    typeof body === 'object' &&
    body !== null &&
    (body as { code?: unknown }).code === TX_EXPIRED_CODE
  );
}

@Injectable()
export class SolanaService {
  private readonly logger = new Logger(SolanaService.name);
  readonly connection: Connection;
  readonly program: Program<OneplanVault>;
  readonly usdcMint: PublicKey;
  private readonly keypair: Keypair | null;

  constructor(private readonly config: ConfigService) {
    // Empty is "unset" (Joi lets ops blank a var), so `||`, not a get() default.
    const rpcUrl =
      this.config.get<string>('SOLANA_RPC_URL') || DEFAULT_SOLANA_RPC_URL;
    const commitment = (this.config.get<string>('SOLANA_COMMITMENT') ||
      DEFAULT_SOLANA_COMMITMENT) as Commitment;
    // Host only: the endpoint carries an API key and a log line is the easiest
    // place for one to leak.
    new Logger(SolanaService.name).log(`RPC ${new URL(rpcUrl).host}`);
    // The websocket endpoint is given rather than derived. web3.js builds one
    // from the http url by swapping the scheme, which drops the query string —
    // and the api key lives there. The subscription was refused, every
    // confirmation fell back to polling, and one confirmation became hundreds of
    // requests until the provider rate-limited everything else the app needed.
    this.connection = new Connection(rpcUrl, {
      commitment,
      wsEndpoint: SolanaService.websocketFor(rpcUrl),
    });

    // A bad value here must switch the feature off, never crash boot: every
    // problem is collected and the fee payer is dropped, so isConfigured is
    // false and each write path answers 503.
    const problems: string[] = [];
    const production = this.config.get<string>('NODE_ENV') === 'production';
    const mintRaw = this.config.get<string>('SOLANA_USDC_MINT');
    if (production && !mintRaw) {
      problems.push('SOLANA_USDC_MINT is unset in production');
    }
    let usdcMint = new PublicKey(DEFAULT_SOLANA_USDC_MINT);
    if (mintRaw) {
      try {
        usdcMint = new PublicKey(mintRaw);
      } catch {
        problems.push('SOLANA_USDC_MINT is not a valid public key');
      }
    }
    this.usdcMint = usdcMint;
    if (production && !this.config.get<string>('SOLANA_RPC_URL')) {
      problems.push('SOLANA_RPC_URL is unset in production');
    }

    const secret = this.config.get<string>('SOLANA_FEE_PAYER_SECRET_KEY', '');
    let keypair: Keypair | null = null;
    if (secret) {
      try {
        keypair = Keypair.fromSecretKey(bs58.decode(secret));
      } catch {
        problems.push('SOLANA_FEE_PAYER_SECRET_KEY is not a valid secret key');
      }
    }
    if (problems.length > 0) {
      keypair = null;
      this.logger.error(
        `Solana misconfigured, group wallet disabled: ${problems.join('; ')}`,
      );
    }
    this.keypair = keypair;

    // A throwaway wallet keeps Anchor constructible when no fee payer is set.
    // Every write path checks isConfigured first, so it is never used to sign.
    const wallet = new Wallet(this.keypair ?? Keypair.generate());
    const provider = new AnchorProvider(this.connection, wallet, {
      commitment,
    });
    this.program = new Program(idl as OneplanVault, provider);

    if (!this.keypair && problems.length === 0) {
      this.logger.warn(
        'SOLANA_FEE_PAYER_SECRET_KEY is not set - vault endpoints will return 503',
      );
    }
  }

  /**
   * Server-side kill switch (WEB3_ENABLED, default false). Distinct from
   * isConfigured: keys can be present on a server where the feature is dark.
   */
  get isEnabled(): boolean {
    const value: unknown = this.config.get('WEB3_ENABLED', false);
    return value === true || value === 'true';
  }

  get isConfigured(): boolean {
    return this.keypair !== null;
  }

  get feePayer(): Keypair {
    if (!this.keypair) {
      throw new ServiceUnavailableException(
        'Solana fee payer is not configured on this server',
      );
    }
    return this.keypair;
  }

  vaultPda(tripId: number): PublicKey {
    return PublicKey.findProgramAddressSync(
      [VAULT_SEED, u64le(tripId)],
      this.program.programId,
    )[0];
  }

  /**
   * USDC ATA that receives the 0.1% deposit skim.
   *
   * Defaults to the fee payer's ATA. Override with SOLANA_TREASURY_OWNER when
   * ops wants a dedicated treasury wallet.
   */
  treasuryAta(): PublicKey {
    return getAssociatedTokenAddressSync(this.usdcMint, this.treasuryOwner());
  }

  /** Owner of the treasury USDC ATA (fee payer unless SOLANA_TREASURY_OWNER). */
  treasuryOwner(): PublicKey {
    const owner = this.config.get<string>('SOLANA_TREASURY_OWNER', '');
    if (!owner) {
      return this.feePayer.publicKey;
    }
    try {
      return new PublicKey(owner);
    } catch {
      throw new ServiceUnavailableException(
        'SOLANA_TREASURY_OWNER is not a valid public key',
      );
    }
  }

  /**
   * Creates the treasury USDC ATA if it is missing.
   *
   * Deposit skim CPI requires a live token account. Without this, the first
   * deposit after a fresh fee-payer wallet fails on chain with no DB row, and
   * the app looks like the button did nothing. Kept as its own fee-payer tx so
   * the member-signed deposit stays a single instruction the client can verify.
   */
  async ensureTreasuryAta(): Promise<PublicKey> {
    const ata = this.treasuryAta();
    const info = await this.connection.getAccountInfo(ata);
    if (info) {
      return ata;
    }

    const ix = createAssociatedTokenAccountIdempotentInstruction(
      this.feePayer.publicKey,
      ata,
      this.treasuryOwner(),
      this.usdcMint,
    );
    const signature = await this.sendAsFeePayer([ix]);
    this.logger.log(
      `created treasury USDC ATA ${ata.toBase58()}: ${signature}`,
    );
    return ata;
  }

  /**
   * Creates the receiver's USDC ATA if it is missing.
   *
   * A personal payment is a plain token transfer into it, and a transfer into an
   * account that does not exist fails on chain. Its own fee-payer tx, like the
   * treasury one, so the member-signed transfer stays a single instruction.
   */
  async ensureReceiverAta(): Promise<PublicKey> {
    const ata = getAssociatedTokenAddressSync(
      this.usdcMint,
      this.receiverPublicKey,
    );
    const info = await this.connection.getAccountInfo(ata);
    if (info) {
      return ata;
    }

    const ix = createAssociatedTokenAccountIdempotentInstruction(
      this.feePayer.publicKey,
      ata,
      this.receiverPublicKey,
      this.usdcMint,
    );
    const signature = await this.sendAsFeePayer([ix]);
    this.logger.log(
      `created receiver USDC ATA ${ata.toBase58()}: ${signature}`,
    );
    return ata;
  }

  /**
   * Builds a legacy transaction, signs it as fee payer, and returns it base64
   * encoded for the client to add its own signature. Legacy only: the iOS client
   * verifies the transaction before signing and does not handle v0 lookup tables.
   */
  async buildUnsignedTx(ixs: TransactionInstruction[]): Promise<string> {
    const { blockhash } = await this.connection.getLatestBlockhash();
    const tx = new Transaction();
    tx.add(...ixs);
    tx.feePayer = this.feePayer.publicKey;
    tx.recentBlockhash = blockhash;
    tx.partialSign(this.feePayer);
    return tx
      .serialize({ requireAllSignatures: false, verifySignatures: false })
      .toString('base64');
  }

  /**
   * Broadcasts a transaction the client has finished signing, and returns as
   * soon as the chain has taken it.
   *
   * Deliberately does not wait for confirmation. Broadcasting and confirming
   * are two separate calls, and losing the second used to lose the signature
   * with it — leaving no way to ask afterwards whether the transaction had
   * landed. The caller records the signature first and confirms second, so a
   * lost answer stays a question that can still be asked.
   *
   * A blockhash that expired while the transaction sat in the member's wallet
   * (slow approval) is a 409 `tx_expired`: the transaction can never land, and
   * the fix is to build and sign a fresh one.
   */
  async broadcastSigned(base64Tx: string): Promise<string> {
    const tx = Transaction.from(Buffer.from(base64Tx, 'base64'));
    try {
      return await this.connection.sendRawTransaction(tx.serialize());
    } catch (error) {
      // Which signer the client failed to satisfy is the whole diagnosis, and
      // the library's message names none of them.
      const signers = tx.signatures.map((entry) => ({
        publicKey: entry.publicKey.toBase58(),
        signed: entry.signature !== null,
      }));
      this.logger.error(
        `broadcast rejected: ${String(error)}; feePayer=${tx.feePayer?.toBase58()} signers=${JSON.stringify(signers)}`,
      );
      if (isExpiredBlockhashError(error)) {
        throw new ConflictException({
          code: TX_EXPIRED_CODE,
          message:
            'This transaction expired before it was sent. Please try again.',
        });
      }
      throw error;
    }
  }

  /**
   * Waits for a broadcast transaction to confirm.
   *
   * The expiry window comes from the blockhash the transaction was built with,
   * not a fresh one: a newer blockhash describes a later window than the one
   * this transaction actually lives in, which can report it expired while it is
   * still perfectly valid.
   */
  async confirmSigned(base64Tx: string, signature: string): Promise<void> {
    const tx = Transaction.from(Buffer.from(base64Tx, 'base64'));
    const blockhash = tx.recentBlockhash;
    if (!blockhash) {
      // Nothing to bound the wait with, so ask the chain outright instead.
      SolanaService.assertLanded(
        await this.connection.confirmTransaction(signature, 'confirmed'),
        signature,
      );
      return;
    }
    const lastValidBlockHeight =
      (await this.connection.getBlockHeight('confirmed')) +
      BLOCKHASH_VALIDITY_BLOCKS;
    SolanaService.assertLanded(
      await this.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      ),
      signature,
    );
  }

  /**
   * confirmTransaction resolves (does not reject) for a transaction that landed
   * and FAILED; the failure is only in `value.err`. Discarding it booked
   * deposits and fired payouts for transactions that moved nothing.
   */
  private static assertLanded(
    result: { value: { err: unknown } },
    signature: string,
  ): void {
    if (result.value.err) {
      throw new Error(
        `transaction ${signature} failed on chain: ${JSON.stringify(result.value.err)}`,
      );
    }
  }

  /**
   * Whether a signature reached the chain, and whether it succeeded there.
   *
   * This is what makes a lost answer recoverable: the question "did the thing
   * I sent actually happen" has one answer, and it is on chain.
   */
  async signatureLanded(signature: string): Promise<boolean> {
    const status = await this.connection.getSignatureStatus(signature, {
      searchTransactionHistory: true,
    });
    const value = status.value;
    return !!value && !value.err;
  }

  /** Sends a transaction that only the server needs to sign. */
  async sendAsFeePayer(
    ixs: TransactionInstruction[],
    extraSigners: Keypair[] = [],
  ): Promise<string> {
    const { blockhash, lastValidBlockHeight } =
      await this.connection.getLatestBlockhash();
    const tx = new Transaction();
    tx.add(...ixs);
    tx.feePayer = this.feePayer.publicKey;
    tx.recentBlockhash = blockhash;
    tx.sign(this.feePayer, ...extraSigners);
    const signature = await this.connection.sendRawTransaction(tx.serialize());
    SolanaService.assertLanded(
      await this.connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed',
      ),
      signature,
    );
    return signature;
  }

  private receiverKeypair: Keypair | null = null;

  /**
   * Owner of the wallet that receives USDC on a merchant payment. In phase 1 the
   * server controls it, standing exactly where Triple-A or FinFan will sit once
   * the fiat leg is real.
   */
  get receiverPublicKey(): PublicKey {
    return this.receiverKeypairOrThrow.publicKey;
  }

  get receiverKeypairOrThrow(): Keypair {
    if (!this.receiverKeypair) {
      const secret = this.config.get<string>('SOLANA_RECEIVER_SECRET_KEY', '');
      if (!secret) {
        throw new ServiceUnavailableException(
          'SOLANA_RECEIVER_SECRET_KEY is not configured',
        );
      }
      try {
        this.receiverKeypair = Keypair.fromSecretKey(bs58.decode(secret));
      } catch {
        this.logger.error(
          'SOLANA_RECEIVER_SECRET_KEY is not a valid secret key',
        );
        throw new ServiceUnavailableException(
          'SOLANA_RECEIVER_SECRET_KEY is not valid',
        );
      }
    }
    return this.receiverKeypair;
  }

  /**
   * Returns funds from the receiver wallet to a vault after a confirmed payout
   * failure. Both the server and the receiver sign; the server owns both keys in
   * phase 1.
   */
  async revertSpend(vaultPda: PublicKey, amountMicro: bigint): Promise<string> {
    const receiver = this.receiverKeypairOrThrow;
    const receiverAta = getAssociatedTokenAddressSync(
      this.usdcMint,
      receiver.publicKey,
    );
    const ix = await this.program.methods
      .revertSpend(new BN(amountMicro.toString()))
      .accountsPartial({
        vault: vaultPda,
        receiverAta,
        receiver: receiver.publicKey,
        server: this.feePayer.publicKey,
        usdcMint: this.usdcMint,
      })
      .instruction();
    return this.sendAsFeePayer([ix], [receiver]);
  }

  /**
   * Returns a failed personal payment to the member who made it.
   *
   * The USDC went from the member's own account to the receiver, not through
   * the vault, so the vault program's revert cannot undo it. The receiver
   * simply sends it back. The member's token account is opened first if it has
   * gone missing since — the refund must not fail for want of somewhere to land.
   */
  async refundPersonalSpend(
    owner: PublicKey,
    amountMicro: bigint,
  ): Promise<string> {
    const receiver = this.receiverKeypairOrThrow;
    const receiverAta = getAssociatedTokenAddressSync(
      this.usdcMint,
      receiver.publicKey,
    );
    const ownerAta = getAssociatedTokenAddressSync(this.usdcMint, owner);
    const ixs = [
      createAssociatedTokenAccountIdempotentInstruction(
        this.feePayer.publicKey,
        ownerAta,
        owner,
        this.usdcMint,
      ),
      createTransferCheckedInstruction(
        receiverAta,
        this.usdcMint,
        ownerAta,
        receiver.publicKey,
        amountMicro,
        6,
      ),
    ];
    return this.sendAsFeePayer(ixs, [receiver]);
  }

  /**
   * After settlement empties the vault ATA and sets status Closed, reclaim
   * PDA + ATA rent to the fee payer. Safe to call only when ATA balance is 0.
   */
  async closeVault(vaultPda: PublicKey): Promise<string> {
    const vaultAta = getAssociatedTokenAddressSync(
      this.usdcMint,
      vaultPda,
      true,
    );
    const ix = await this.program.methods
      .closeVault()
      .accountsPartial({
        vault: vaultPda,
        vaultAta,
        server: this.feePayer.publicKey,
      })
      .instruction();
    return this.sendAsFeePayer([ix]);
  }

  /** The same endpoint over websocket, api key and all. */
  private static websocketFor(rpcUrl: string): string {
    const url = new URL(rpcUrl);
    url.protocol = url.protocol === 'http:' ? 'ws:' : 'wss:';
    return url.toString();
  }

  async getTokenBalance(ata: PublicKey): Promise<bigint> {
    const info = await this.connection.getTokenAccountBalance(ata);
    return BigInt(info.value.amount);
  }
}
