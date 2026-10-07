import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ExpenseCategory,
  InviteStatus,
  Prisma,
  TripMemberRole,
  TripStatus,
  VaultStatus,
  VaultTransaction,
  VaultTxKind,
  VaultTxSource,
  VaultTxStatus,
} from '@prisma/client';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import BN from 'bn.js';

import { PrismaService } from '../prisma/prisma.service';
import { isTxExpired, SolanaService } from '../solana/solana.service';
import {
  assertInstructionAccounts,
  decodeTransferChecked,
  decodeVaultInstruction,
} from '../solana/tx-verify';
import { PAYOUT_PROVIDER } from '../payout/payout-provider.interface';
// Imported as a type: an interface in a decorated constructor breaks
// emitDecoratorMetadata under isolatedModules unless it is a type-only import.
import type { PayoutProvider } from '../payout/payout-provider.interface';
import { decodeVietQr } from '../payout/vietqr';
import { ExpensesService } from '../expenses/expenses.service';
import { TripsHandler } from '../realtime/handlers/trips.handler';
import { TripVaultService } from './trip-vault.service';
import { PAYOUT_SENDING } from './payout-claim';
import { VAULT_FAILURE_CODES } from './vault-failure-codes';

export interface PayQuote {
  recipientName: string;
  bankBin: string;
  accountNumber: string;
  amountVnd: bigint;
  amountUsdcMicro: bigint;
  feeMicro: bigint;
  rate: string;
  needsApproval: boolean;
  description: string | null;
  source: VaultTxSource;
  /** PERSONAL only: the payer's wallet, resolved during the balance check. */
  payer: { publicKey: PublicKey; usdcAta: PublicKey } | null;
}

export interface PreparePaymentInput {
  qrPayload: string;
  amountVnd?: bigint;
  name: string;
  category: ExpenseCategory;
  shareWithUserIds: number[];
  source: VaultTxSource;
}

/** Circle USDC has six decimals, and transferChecked is told so on purpose. */
const USDC_DECIMALS = 6;

@Injectable()
export class TripVaultPayService {
  private readonly logger = new Logger(TripVaultPayService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vaultService: TripVaultService,
    private readonly solana: SolanaService,
    @Inject(PAYOUT_PROVIDER) private readonly payout: PayoutProvider,
    private readonly expenses: ExpensesService,
    private readonly trips: TripsHandler,
  ) {}

  /** Deterministic so the reconciliation cron can retry without duplicating. */
  payoutRefFor(vaultTransactionId: number): string {
    return `vault-tx-${vaultTransactionId}`;
  }

  /**
   * Who a QR code pays, without pricing anything.
   *
   * The amount screen shows the recipient's real name while the user is still
   * typing an amount, and most Vietnamese shop codes carry no amount at all, so
   * quote cannot answer this: it refuses without one. The name comes from the
   * bank rather than from the code, which is the point — it is what tells
   * someone they are paying who they think they are.
   */
  async lookupRecipient(qrPayload: string): Promise<{
    recipientName: string;
    bankBin: string;
    accountNumber: string;
    amountVnd: bigint | null;
    description: string | null;
  }> {
    const decoded = decodeVietQr(qrPayload);
    const recipient = await this.payout.validateRecipient({
      bankBin: decoded.bankBin,
      accountNumber: decoded.accountNumber,
    });
    if (!recipient) {
      throw new BadRequestException('Recipient account could not be validated');
    }
    return {
      recipientName: recipient.accountName,
      bankBin: decoded.bankBin,
      accountNumber: decoded.accountNumber,
      amountVnd: decoded.amountVnd,
      description: decoded.description,
    };
  }

  /**
   * Prices a payment and checks the wallet that will fund it.
   *
   * A VAULT payment is checked against the group balance and may need a second
   * signature above the trip threshold. A PERSONAL payment is checked against
   * the caller's own USDC account and never needs approval: it is their money,
   * fronted for the group, and nobody else has a say in how they spend it.
   */
  async quote(
    tripId: number,
    userId: number,
    qrPayload: string,
    amountVndOverride?: bigint,
    source: VaultTxSource = VaultTxSource.VAULT,
  ): Promise<PayQuote> {
    // Personal money does not need the group to have funded anything, but
    // the ledger row still hangs off the trip's vault, so one is created on
    // demand rather than sending the member off to deposit first.
    const vault =
      source === VaultTxSource.PERSONAL
        ? await this.vaultService.ensureDefaultVault(tripId, userId)
        : await this.vaultService.requireVault(tripId);
    const decoded = decodeVietQr(qrPayload);

    const amountVnd = decoded.amountVnd ?? amountVndOverride;
    if (!amountVnd || amountVnd <= 0n) {
      throw new BadRequestException(
        'This QR code carries no amount; supply amountVnd',
      );
    }

    const recipient = await this.payout.validateRecipient({
      bankBin: decoded.bankBin,
      accountNumber: decoded.accountNumber,
    });
    if (!recipient) {
      throw new BadRequestException('Recipient account could not be validated');
    }

    const priced = await this.payout.quote({ amountVnd });

    let payer: PayQuote['payer'] = null;
    let needsApproval = false;
    if (source === VaultTxSource.PERSONAL) {
      // No fee here: the vault skims its fee at deposit, and personal money was
      // never deposited. What the transfer moves is exactly what is checked.
      const wallet = await this.vaultService.walletBalance(userId);
      if (!wallet.publicKey || !wallet.usdcAta) {
        throw new BadRequestException('Link a wallet before paying');
      }
      if (priced.amountUsdcMicro > wallet.balanceMicro) {
        throw new BadRequestException(
          'Your wallet balance is not enough for this payment',
        );
      }
      payer = {
        publicKey: new PublicKey(wallet.publicKey),
        usdcAta: new PublicKey(wallet.usdcAta),
      };
    } else {
      const { balanceMicro } = await this.vaultService.getBalance(tripId);
      if (priced.amountUsdcMicro + priced.feeMicro > balanceMicro) {
        throw new BadRequestException(
          'Vault balance is not enough for this payment',
        );
      }
      needsApproval = priced.amountUsdcMicro > vault.thresholdMicro;
    }

    return {
      recipientName: recipient.accountName,
      bankBin: decoded.bankBin,
      accountNumber: decoded.accountNumber,
      amountVnd,
      amountUsdcMicro: priced.amountUsdcMicro,
      feeMicro: priced.feeMicro,
      rate: priced.rate,
      needsApproval,
      description: decoded.description,
      source,
      payer,
    };
  }

  /**
   * Records the intent and returns the transaction for the payer to sign. Above
   * the threshold this builds propose_spend instead of spend; the caller shows
   * "awaiting approval" rather than a failure.
   */
  async preparePayment(
    tripId: number,
    userId: number,
    input: PreparePaymentInput,
  ): Promise<{
    base64Tx: string;
    vaultTransactionId: number;
    needsApproval: boolean;
    source: VaultTxSource;
    amountUsdcMicro: string;
    payerAta?: string;
  }> {
    const priced = await this.quote(
      tripId,
      userId,
      input.qrPayload,
      input.amountVnd,
      input.source,
    );
    const vault = await this.vaultService.requireVault(tripId);
    const isPersonal = input.source === VaultTxSource.PERSONAL;
    // Before any row exists: an outsider or duplicate id would otherwise make
    // createFromVault throw AFTER the fiat payout, leaving the row PENDING for
    // the cron to retry forever.
    const shareWithUserIds = await this.validateShares(
      tripId,
      input.shareWithUserIds,
    );

    const record = await this.prisma.vaultTransaction.create({
      data: {
        tripVaultId: vault.id,
        userId,
        kind: VaultTxKind.SPEND,
        source: input.source,
        status: VaultTxStatus.PENDING,
        amountMicro: priced.amountUsdcMicro,
        amountVnd: priced.amountVnd,
        bankBin: priced.bankBin,
        bankAccount: priced.accountNumber,
        recipientName: priced.recipientName,
        qrPayload: input.qrPayload,
        // A personal payment pays no fee (see quote), so the receipt says so.
        feeMicro: isPersonal ? 0n : priced.feeMicro,
        rate: priced.rate,
        note: priced.description,
        expenseName: input.name,
        expenseCategory: input.category,
        shareWithUserIds,
      },
    });

    await this.prisma.vaultTransaction.update({
      where: { id: record.id },
      data: { payoutRef: this.payoutRefFor(record.id) },
    });

    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new BadRequestException('Link a wallet before paying');
    }
    const signer = new PublicKey(wallet.publicKey);

    const base64Tx = isPersonal
      ? await this.buildPersonalSpendTx(signer, priced.amountUsdcMicro)
      : await this.buildSpendTx(tripId, priced.amountUsdcMicro, signer);

    // Nothing about the proposal is recorded or announced here. This method only
    // builds a transaction; whether it reaches the chain is decided later, and
    // the address it will occupy is not knowable until it does. Predicting it
    // from the current nonce also gave two members preparing at the same moment
    // the same address, and only one of them could be right.

    return {
      base64Tx,
      vaultTransactionId: record.id,
      needsApproval: priced.needsApproval,
      source: input.source,
      amountUsdcMicro: priced.amountUsdcMicro.toString(),
      ...(isPersonal && priced.payer
        ? { payerAta: priced.payer.usdcAta.toBase58() }
        : {}),
    };
  }

  /**
   * Submits the signed on-chain leg, then attempts the fiat leg.
   *
   * The three outcomes are deliberately asymmetric:
   * - SUCCESS  confirms the row and creates the expense with its split
   * - FAILED   marks the row failed; the cron reverts the on-chain transfer
   * - UNKNOWN  leaves the row PENDING. Never revert here: the payout may well
   *            have gone through and reverting would pay twice.
   */
  /**
   * Deduplicates the ids a payment is split across and requires every one to be
   * an accepted member of this trip. Empty stays empty (= everyone).
   */
  private async validateShares(
    tripId: number,
    shareWithUserIds: number[],
  ): Promise<number[]> {
    const unique = [...new Set(shareWithUserIds)];
    if (unique.length === 0) {
      return unique;
    }
    const accepted = await this.prisma.tripMember.findMany({
      where: {
        tripId,
        inviteStatus: InviteStatus.ACCEPTED,
        userId: { in: unique },
      },
      select: { userId: true },
    });
    if (accepted.length !== unique.length) {
      throw new BadRequestException(
        'shareWithUserIds must be accepted trip members',
      );
    }
    return unique;
  }

  private async callerWallet(
    userId: number,
    action: string,
  ): Promise<PublicKey> {
    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new BadRequestException(`Link a wallet before ${action}`);
    }
    return new PublicKey(wallet.publicKey);
  }

  /** Host or co-host of the trip (accepted). */
  private async isHostOrCoHost(
    tripId: number,
    userId: number,
  ): Promise<boolean> {
    const row = await this.prisma.tripMember.findFirst({
      where: {
        tripId,
        userId,
        inviteStatus: InviteStatus.ACCEPTED,
        role: { in: [TripMemberRole.HOST, TripMemberRole.CO_HOST] },
      },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Proves the signed transaction is the one this row asked for and that the
   * caller is allowed to submit it (audit S2). The request body says nothing
   * about the bytes, so everything is read out of them: program, instruction,
   * vault, token accounts, signer and amount must all match the row, and the
   * caller must be the row's payer — or, for the approval leg, an approver who
   * is not the proposer.
   */
  private async verifyPaymentTx(
    record: VaultTransaction,
    vault: { vaultPda: string; usdcAta: string; thresholdMicro: bigint },
    signedTx: string,
    callerUserId: number,
    tripId: number,
  ): Promise<void> {
    const signer = await this.callerWallet(callerUserId, 'paying');
    const feePayer = this.solana.feePayer.publicKey;
    const mint = this.solana.usdcMint;
    const receiverAta = getAssociatedTokenAddressSync(
      mint,
      this.solana.receiverPublicKey,
    );
    const requirePayer = () => {
      if (record.userId !== callerUserId) {
        throw new ForbiddenException('Only the payer can submit this payment');
      }
    };
    const requireSigner = (signers: PublicKey[]) => {
      if (!signers.some((key) => key.equals(signer))) {
        throw new BadRequestException('Payment rejected: not signed by you');
      }
    };

    if (record.source === VaultTxSource.PERSONAL) {
      requirePayer();
      const transfer = decodeTransferChecked(signedTx, feePayer);
      if (
        !transfer.authority.equals(signer) ||
        !transfer.source.equals(getAssociatedTokenAddressSync(mint, signer)) ||
        !transfer.destination.equals(receiverAta) ||
        !transfer.mint.equals(mint) ||
        transfer.decimals !== USDC_DECIMALS ||
        transfer.amountMicro !== record.amountMicro
      ) {
        throw new BadRequestException(
          'Payment rejected: the transfer does not match this payment',
        );
      }
      return;
    }

    const vaultPda = new PublicKey(vault.vaultPda);
    const vaultAta = new PublicKey(vault.usdcAta);
    const needsApproval = record.amountMicro > vault.thresholdMicro;

    if (needsApproval && record.proposalPda) {
      // Second leg: an approver signs approve_spend; no amount in the bytes,
      // so the binding is to this vault's open proposal and the receiver.
      if (record.userId === callerUserId) {
        throw new ForbiddenException(
          'The member who raised a payment cannot approve it',
        );
      }
      const approvers = await this.vaultService.approverUserIds(tripId);
      if (approvers && !approvers.includes(callerUserId)) {
        throw new ForbiddenException('Only a host or co-host can approve');
      }
      const ix = decodeVaultInstruction(
        signedTx,
        feePayer,
        this.solana.program.programId,
        'approve_spend',
      );
      assertInstructionAccounts(
        ix,
        [
          ['vault', vaultPda],
          ['vault_ata', vaultAta],
          ['signer', signer],
          ['recipient_ata', receiverAta],
          ['usdc_mint', mint],
          ['token_program', TOKEN_PROGRAM_ID],
        ],
        'Approval',
      );
      requireSigner(ix.signers);
      return;
    }

    requirePayer();
    const name = needsApproval ? 'propose_spend' : 'spend';
    const ix = decodeVaultInstruction(
      signedTx,
      feePayer,
      this.solana.program.programId,
      name,
    );
    assertInstructionAccounts(
      ix,
      needsApproval
        ? [
            ['vault', vaultPda],
            ['signer', signer],
            ['recipient_ata', receiverAta],
          ]
        : [
            ['vault', vaultPda],
            ['vault_ata', vaultAta],
            ['signer', signer],
            ['recipient_ata', receiverAta],
            ['usdc_mint', mint],
            ['token_program', TOKEN_PROGRAM_ID],
          ],
      'Payment',
    );
    requireSigner(ix.signers);
    if (ix.amountMicro !== record.amountMicro) {
      throw new BadRequestException(
        'Payment rejected: the amount does not match this payment',
      );
    }
  }

  /// Loads a vault transaction and proves it belongs to `tripId`.
  ///
  /// The route is nested under a trip, so without this check the trip segment is
  /// decorative: any authenticated member of any trip could act on any other
  /// trip's transaction just by knowing its id.
  private async requireTransactionInTrip(
    vaultTransactionId: number,
    tripId: number,
  ): Promise<VaultTransaction> {
    const record = await this.prisma.vaultTransaction.findUnique({
      where: { id: vaultTransactionId },
      include: { tripVault: { select: { tripId: true } } },
    });
    if (!record || record.tripVault.tripId !== tripId) {
      throw new NotFoundException('Vault transaction not found');
    }
    return record;
  }

  async submitPayment(
    vaultTransactionId: number,
    signedTx: string,
    tripId: number,
    callerUserId: number,
  ): Promise<VaultTransaction> {
    const record = await this.requireTransactionInTrip(
      vaultTransactionId,
      tripId,
    );
    if (record.status !== VaultTxStatus.PENDING) {
      return record;
    }
    const vault = await this.vaultService.requireVault(tripId);
    await this.verifyPaymentTx(record, vault, signedTx, callerUserId, tripId);

    // Recorded before the wait, not after. Confirming is a second network call,
    // and losing it used to lose the signature with it — the payment had left
    // the vault and nothing on this side could say so, or even ask. With the
    // signature stored the reconcile job can settle it whatever happens next.
    // The unique index on signature makes a replayed transaction fail here
    // instead of being attached to a second row (S7).
    let signature: string;
    try {
      signature = await this.solana.broadcastSigned(signedTx);
    } catch (error) {
      if (isTxExpired(error) && !record.signature && !record.proposalPda) {
        // The blockhash expired while the member was approving, so nothing
        // reached the chain. The client only abandons a row it never signed,
        // so retire it here the same way, or it reads as money spent until
        // the reconcile job's grace period runs out. An approval leg keeps its
        // open proposal: that can still be approved again.
        await this.prisma.vaultTransaction.updateMany({
          where: {
            id: record.id,
            status: VaultTxStatus.PENDING,
            signature: null,
            proposalPda: null,
          },
          data: {
            status: VaultTxStatus.FAILED,
            failureCode: VAULT_FAILURE_CODES.abandoned,
          },
        });
      }
      throw error;
    }
    try {
      await this.prisma.vaultTransaction.update({
        where: { id: record.id },
        data: { signature },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This transaction was already submitted');
      }
      throw error;
    }
    await this.solana.confirmSigned(signedTx, signature);

    // An above-threshold payment reaches here twice: once for the proposal and
    // again for the approval that executes it. Only the second moves any USDC,
    // so only the second may pay the merchant — paying on the first would hand
    // over dong for money still sitting in the vault.
    // Only the group's money answers to the group's threshold. A personal
    // payment was signed by the only person whose money it is.
    const needsApproval =
      record.source !== VaultTxSource.PERSONAL &&
      record.amountMicro > vault.thresholdMicro;

    if (needsApproval && !record.proposalPda) {
      // The proposal leg. Its address is read back from the chain now that it
      // exists, rather than guessed before it did — which is what left rows
      // pointing at accounts that were never created, offering an approval that
      // could only fail. Asking for that approval waits until here for the same
      // reason: there is now something to approve.
      const proposalPda = await this.landedProposalPda(vault.vaultPda);
      await this.prisma.vaultTransaction.update({
        where: { id: record.id },
        data: { proposalPda },
      });
      this.trips.sendVaultApprovalRequested(tripId, {
        vaultTransactionId: record.id,
        amountVnd: record.amountVnd?.toString() ?? '0',
        recipientName: record.recipientName ?? '',
        proposedByUserId: record.userId,
        approverUserIds: await this.vaultService.approverUserIds(tripId),
      });
      return this.prisma.vaultTransaction.findUniqueOrThrow({
        where: { id: record.id },
      });
    }

    if (needsApproval && !record.approvedAt) {
      if (!(await this.isProposalExecuted(record.proposalPda!))) {
        return this.prisma.vaultTransaction.findUniqueOrThrow({
          where: { id: record.id },
        });
      }
      await this.prisma.vaultTransaction.update({
        where: { id: record.id },
        data: { approvedAt: new Date() },
      });
    }

    // One submit owns the fiat leg. Without the claim two parallel submits of
    // the same signed transaction both paid out and both created the expense.
    const claim = await this.prisma.vaultTransaction.updateMany({
      where: {
        id: record.id,
        status: VaultTxStatus.PENDING,
        payoutStatus: null,
      },
      data: { payoutStatus: PAYOUT_SENDING },
    });
    if (claim.count === 0) {
      return this.prisma.vaultTransaction.findUniqueOrThrow({
        where: { id: record.id },
      });
    }

    const result = await this.payout.payout({
      bankBin: record.bankBin!,
      accountNumber: record.bankAccount!,
      amountVnd: record.amountVnd!,
      reference: record.payoutRef ?? this.payoutRefFor(record.id),
    });

    if (result.outcome === 'SUCCESS') {
      const expense = await this.expenses.createFromVault({
        tripId,
        paidByUserId: record.userId ?? undefined,
        amountVnd: record.amountVnd!,
        amountUsdcMicro: record.amountMicro,
        rate: record.rate,
        name: record.expenseName ?? 'Vault payment',
        category: record.expenseCategory ?? ExpenseCategory.OTHER,
        shareWithUserIds: record.shareWithUserIds,
      });
      // A personal payment never touched the vault, so its cached balance is
      // still right.
      if (record.source !== VaultTxSource.PERSONAL) {
        this.vaultService.invalidateBalance(tripId);
      }
      const actor = record.userId
        ? await this.prisma.user.findUnique({
            where: { id: record.userId },
            select: { displayName: true },
          })
        : null;
      this.trips.sendVaultBalanceChanged(tripId, {
        kind: VaultTxKind.SPEND,
        actorUserId: record.userId,
        actorName: actor?.displayName ?? '',
        amountMicro: record.amountMicro.toString(),
      });
      return this.prisma.vaultTransaction.update({
        where: { id: record.id },
        data: {
          status: VaultTxStatus.CONFIRMED,
          payoutStatus: result.outcome,
          expenseId: expense.id,
        },
      });
    }

    if (result.outcome === 'FAILED') {
      return this.prisma.vaultTransaction.update({
        where: { id: record.id },
        data: {
          status: VaultTxStatus.FAILED,
          payoutStatus: result.outcome,
          failureCode: result.failureCode,
        },
      });
    }

    this.logger.warn(
      `payout ${record.payoutRef} returned ${result.outcome}; leaving PENDING for the reconcile cron`,
    );
    return this.prisma.vaultTransaction.update({
      where: { id: record.id },
      data: { payoutStatus: result.outcome },
    });
  }

  /**
   * Marker that an above-threshold spend is open on the vault.
   *
   * Format `vaultPda:totalSpentAtPropose`. Cleared slot + higher totalSpent
   * means execute; cleared slot + same totalSpent means cancel.
   */
  private async landedProposalPda(vaultPda: string): Promise<string> {
    const onChain = await this.solana.program.account.tripVault.fetch(
      new PublicKey(vaultPda),
    );
    if (!onChain.hasActiveSpend) {
      throw new Error('propose_spend did not open an active spend');
    }
    return `${vaultPda}:${onChain.totalSpent.toString()}`;
  }

  /**
   * Whether the second signature has landed and the transfer has run.
   */
  private async isProposalExecuted(proposalPda: string): Promise<boolean> {
    const [vaultPda, spentAtPropose] = proposalPda.split(':');
    if (!vaultPda || spentAtPropose === undefined) {
      return false;
    }
    const onChain = await this.solana.program.account.tripVault.fetch(
      new PublicKey(vaultPda),
    );
    if (onChain.hasActiveSpend) {
      return false;
    }
    return BigInt(onChain.totalSpent.toString()) > BigInt(spentAtPropose);
  }

  /**
   * Chooses the instruction by threshold. At or below it a single member
   * signature is enough; above it the transaction only creates a proposal and a
   * second member has to approve before any funds move.
   */
  async buildSpendTx(
    tripId: number,
    amountMicro: bigint,
    signer: PublicKey,
  ): Promise<string> {
    const vault = await this.vaultService.requireVault(tripId);
    const vaultPda = new PublicKey(vault.vaultPda);
    const recipientAta = getAssociatedTokenAddressSync(
      this.solana.usdcMint,
      this.solana.receiverPublicKey,
    );

    if (amountMicro <= vault.thresholdMicro) {
      const ix = await this.solana.program.methods
        .spend(new BN(amountMicro.toString()))
        .accountsPartial({
          vault: vaultPda,
          signer,
          recipientAta,
          usdcMint: this.solana.usdcMint,
        })
        .instruction();
      return this.solana.buildUnsignedTx([ix]);
    }

    const ix = await this.solana.program.methods
      .proposeSpend(new BN(amountMicro.toString()))
      .accountsPartial({
        vault: vaultPda,
        signer,
        recipientAta,
      })
      .instruction();
    return this.solana.buildUnsignedTx([ix]);
  }

  /**
   * A plain USDC transfer from the member's own token account to the receiver,
   * with this server paying the network fee — the same shape as a wallet
   * withdrawal, pointed at the payout receiver instead of an address the member
   * typed. Nothing here touches the vault program.
   *
   * The receiver account is created in its own fee-payer transaction when
   * missing, so the member-signed transaction stays a single instruction the
   * client can verify before signing.
   */
  async buildPersonalSpendTx(
    owner: PublicKey,
    amountMicro: bigint,
  ): Promise<string> {
    const from = getAssociatedTokenAddressSync(this.solana.usdcMint, owner);
    const to = await this.solana.ensureReceiverAta();
    const ix = createTransferCheckedInstruction(
      from,
      this.solana.usdcMint,
      to,
      owner,
      amountMicro,
      USDC_DECIMALS,
    );
    return this.solana.buildUnsignedTx([ix]);
  }

  /** Builds the second signature for an above-threshold payment. */
  async buildApprovalTx(
    vaultTransactionId: number,
    userId: number,
    tripId: number,
  ): Promise<string> {
    const record = await this.requireTransactionInTrip(
      vaultTransactionId,
      tripId,
    );
    if (record.status !== VaultTxStatus.PENDING || !record.proposalPda) {
      throw new BadRequestException('This payment is not awaiting approval');
    }
    if (record.userId === userId) {
      throw new ForbiddenException(
        'The member who raised a payment cannot approve it',
      );
    }
    const approvers = await this.vaultService.approverUserIds(tripId);
    if (approvers && !approvers.includes(userId)) {
      throw new ForbiddenException('Only a host or co-host can approve');
    }

    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new BadRequestException('Link a wallet before approving');
    }

    const vault = await this.prisma.tripVault.findUniqueOrThrow({
      where: { id: record.tripVaultId },
    });
    const recipientAta = getAssociatedTokenAddressSync(
      this.solana.usdcMint,
      this.solana.receiverPublicKey,
    );

    const ix = await this.solana.program.methods
      .approveSpend()
      .accountsPartial({
        vault: new PublicKey(vault.vaultPda),
        signer: new PublicKey(wallet.publicKey),
        recipientAta,
        usdcMint: this.solana.usdcMint,
      })
      .instruction();

    return this.solana.buildUnsignedTx([ix]);
  }

  /**
   * Cancels the active above-threshold spend. Proposer, host, or co-host.
   */
  async buildCancelTx(
    vaultTransactionId: number,
    userId: number,
    tripId: number,
  ): Promise<string> {
    const record = await this.requireTransactionInTrip(
      vaultTransactionId,
      tripId,
    );
    await this.assertCancellable(record, userId, tripId);

    const wallet = await this.prisma.walletAccount.findUnique({
      where: { userId },
    });
    if (!wallet) {
      throw new BadRequestException('Link a wallet before cancelling');
    }

    const vault = await this.prisma.tripVault.findUniqueOrThrow({
      where: { id: record.tripVaultId },
    });

    const ix = await this.solana.program.methods
      .cancelSpend()
      .accountsPartial({
        vault: new PublicKey(vault.vaultPda),
        signer: new PublicKey(wallet.publicKey),
      })
      .instruction();

    return this.solana.buildUnsignedTx([ix]);
  }

  /** A cancel needs an open proposal and is the proposer's or a host's to make. */
  private async assertCancellable(
    record: VaultTransaction,
    userId: number,
    tripId: number,
  ): Promise<void> {
    if (record.status !== VaultTxStatus.PENDING || !record.proposalPda) {
      throw new BadRequestException('This payment has no open proposal');
    }
    if (
      record.userId !== userId &&
      !(await this.isHostOrCoHost(tripId, userId))
    ) {
      throw new ForbiddenException(
        'Only the member who raised this payment or a host can cancel it',
      );
    }
  }

  async submitCancel(
    vaultTransactionId: number,
    signedTx: string,
    tripId: number,
    callerUserId: number,
  ): Promise<VaultTransaction> {
    const record = await this.requireTransactionInTrip(
      vaultTransactionId,
      tripId,
    );
    // S3: without these checks any member could flip someone else's CONFIRMED
    // spend to FAILED/cancelled with any transaction at all, erasing it from
    // every share while the fiat was already paid.
    await this.assertCancellable(record, callerUserId, tripId);
    const vault = await this.vaultService.requireVault(tripId);
    const signer = await this.callerWallet(callerUserId, 'cancelling');
    const ix = decodeVaultInstruction(
      signedTx,
      this.solana.feePayer.publicKey,
      this.solana.program.programId,
      'cancel_spend',
    );
    assertInstructionAccounts(
      ix,
      [
        ['vault', new PublicKey(vault.vaultPda)],
        ['signer', signer],
      ],
      'Cancel',
    );
    if (!ix.signers.some((key) => key.equals(signer))) {
      throw new BadRequestException('Cancel rejected: not signed by you');
    }

    const signature = await this.solana.broadcastSigned(signedTx);
    await this.solana.confirmSigned(signedTx, signature);
    // Atomic: only a row still PENDING with an open proposal flips, so a second
    // submit of the same cancel cannot rewrite an outcome that has moved on.
    try {
      await this.prisma.vaultTransaction.updateMany({
        where: {
          id: record.id,
          status: VaultTxStatus.PENDING,
          proposalPda: { not: null },
        },
        data: {
          status: VaultTxStatus.FAILED,
          failureCode: VAULT_FAILURE_CODES.cancelled,
          signature,
          proposalPda: null,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('This transaction was already submitted');
      }
      throw error;
    }
    return this.prisma.vaultTransaction.findUniqueOrThrow({
      where: { id: record.id },
    });
  }

  /**
   * Retires a payment the client could not sign.
   *
   * The row is created before the signature is requested, so a failed
   * verification or wallet error would otherwise leave a PENDING spend that
   * looks paid. Only the member who started it can abandon it, and only while
   * nothing has reached the chain: once a signature exists the reconcile job
   * owns the outcome.
   */
  async abandonPayment(
    vaultTransactionId: number,
    tripId: number,
    userId: number,
  ): Promise<VaultTransaction> {
    const record = await this.requireTransactionInTrip(
      vaultTransactionId,
      tripId,
    );
    if (record.status !== VaultTxStatus.PENDING) {
      return record;
    }
    if (record.userId !== userId) {
      throw new ForbiddenException('Only the payer can abandon this payment');
    }
    if (record.signature !== null || record.proposalPda !== null) {
      throw new BadRequestException(
        'This payment has already been submitted; it cannot be abandoned',
      );
    }
    return this.prisma.vaultTransaction.update({
      where: { id: record.id },
      data: {
        status: VaultTxStatus.FAILED,
        failureCode: VAULT_FAILURE_CODES.abandoned,
      },
    });
  }

  /**
   * Edits share / name / category on a confirmed spend. Amount stays locked —
   * the on-chain transfer already happened.
   */
  async updateSpendMetadata(
    tripId: number,
    vaultTransactionId: number,
    callerUserId: number,
    input: {
      name?: string;
      category?: ExpenseCategory;
      shareWithUserIds?: number[];
    },
  ): Promise<VaultTransaction> {
    if (
      input.name === undefined &&
      input.category === undefined &&
      input.shareWithUserIds === undefined
    ) {
      throw new BadRequestException('Nothing to update');
    }

    const record = await this.requireTransactionInTrip(
      vaultTransactionId,
      tripId,
    );
    if (record.kind !== VaultTxKind.SPEND) {
      throw new BadRequestException('Only spend transactions can be edited');
    }
    if (record.status !== VaultTxStatus.CONFIRMED) {
      throw new BadRequestException('Only confirmed spends can be edited');
    }

    const vault = await this.vaultService.requireVault(tripId);
    if (vault.status === VaultStatus.CLOSED) {
      throw new BadRequestException(
        'Cannot edit spends after the vault has settled',
      );
    }

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: tripId },
      select: { status: true },
    });
    if (trip.status === TripStatus.ENDED) {
      throw new BadRequestException(
        'Cannot edit spends after the trip has ended',
      );
    }

    const isHost = await this.prisma.tripMember.findFirst({
      where: {
        tripId,
        userId: callerUserId,
        inviteStatus: InviteStatus.ACCEPTED,
        role: { in: [TripMemberRole.HOST, TripMemberRole.CO_HOST] },
      },
      select: { id: true },
    });
    if (record.userId !== callerUserId && !isHost) {
      throw new ForbiddenException(
        'Only the payer or a host can edit this transaction',
      );
    }

    let nextShares = record.shareWithUserIds;
    if (input.shareWithUserIds !== undefined) {
      if (input.shareWithUserIds.length > 0) {
        const accepted = await this.prisma.tripMember.findMany({
          where: {
            tripId,
            inviteStatus: InviteStatus.ACCEPTED,
            userId: { in: input.shareWithUserIds },
          },
          select: { userId: true },
        });
        const acceptedIds = new Set(accepted.map((row) => row.userId));
        const invalid = input.shareWithUserIds.filter(
          (id) => !acceptedIds.has(id),
        );
        if (invalid.length > 0) {
          throw new BadRequestException(
            'shareWithUserIds must be accepted trip members',
          );
        }
      }
      nextShares = input.shareWithUserIds;
    }

    const updated = await this.prisma.vaultTransaction.update({
      where: { id: record.id },
      data: {
        ...(input.name !== undefined ? { expenseName: input.name } : {}),
        ...(input.category !== undefined
          ? { expenseCategory: input.category }
          : {}),
        ...(input.shareWithUserIds !== undefined
          ? { shareWithUserIds: nextShares }
          : {}),
      },
    });

    if (record.expenseId) {
      await this.expenses.updateExpense(
        tripId,
        record.expenseId,
        callerUserId,
        {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.category !== undefined ? { category: input.category } : {}),
          ...(input.shareWithUserIds !== undefined
            ? {
                memberIds:
                  nextShares.length > 0
                    ? nextShares
                    : (
                        await this.prisma.tripMember.findMany({
                          where: {
                            tripId,
                            inviteStatus: InviteStatus.ACCEPTED,
                          },
                          select: { userId: true },
                        })
                      ).map((row) => row.userId),
              }
            : {}),
        },
      );
    }

    return updated;
  }
}
