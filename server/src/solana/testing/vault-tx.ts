import { ConfigService } from '@nestjs/config';
import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import {
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import BN from 'bn.js';
import bs58 from 'bs58';

import { SolanaService } from '../solana.service';

/**
 * Test-only builders for the signed transactions members send to the server.
 * They construct real instructions with the real program IDL and sign them for
 * real, so the decoders in tx-verify.ts are exercised on genuine bytes rather
 * than on mocks of themselves. Excluded from the production build.
 */

const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

export function testSolana(
  overrides: Record<string, string> = {},
): SolanaService {
  const values: Record<string, string> = {
    SOLANA_RPC_URL: 'https://api.devnet.solana.com',
    SOLANA_USDC_MINT: USDC_MINT,
    SOLANA_COMMITMENT: 'confirmed',
    SOLANA_FEE_PAYER_SECRET_KEY: bs58.encode(Keypair.generate().secretKey),
    ...overrides,
  };
  return new SolanaService({
    get: (key: string, fallback?: string) => values[key] ?? fallback,
    getOrThrow: (key: string) => values[key],
  } as unknown as ConfigService);
}

/** Server-signed (fee payer) then member-signed, serialised base64. */
export function signTx(
  solana: SolanaService,
  ixs: TransactionInstruction[],
  signers: Keypair[],
  { blockhash = Keypair.generate().publicKey.toBase58() } = {},
): string {
  const tx = new Transaction();
  tx.add(...ixs);
  tx.feePayer = solana.feePayer.publicKey;
  tx.recentBlockhash = blockhash;
  tx.partialSign(solana.feePayer);
  if (signers.length > 0) {
    tx.partialSign(...signers);
  }
  return tx
    .serialize({ requireAllSignatures: false, verifySignatures: false })
    .toString('base64');
}

export async function depositIx(
  solana: SolanaService,
  args: {
    vault: PublicKey;
    owner: PublicKey;
    amount: bigint;
    treasuryAta?: PublicKey;
    ownerAta?: PublicKey;
    vaultAta?: PublicKey;
  },
): Promise<TransactionInstruction> {
  return solana.program.methods
    .deposit(new BN(args.amount.toString()))
    .accountsPartial({
      vault: args.vault,
      ...(args.vaultAta ? { vaultAta: args.vaultAta } : {}),
      treasuryAta: args.treasuryAta ?? solana.treasuryAta(),
      ownerAta:
        args.ownerAta ??
        getAssociatedTokenAddressSync(solana.usdcMint, args.owner),
      owner: args.owner,
      usdcMint: solana.usdcMint,
    })
    .instruction();
}

export async function spendIx(
  solana: SolanaService,
  args: {
    vault: PublicKey;
    signer: PublicKey;
    amount: bigint;
    recipientAta: PublicKey;
  },
): Promise<TransactionInstruction> {
  return solana.program.methods
    .spend(new BN(args.amount.toString()))
    .accountsPartial({
      vault: args.vault,
      signer: args.signer,
      recipientAta: args.recipientAta,
      usdcMint: solana.usdcMint,
    })
    .instruction();
}

export async function proposeSpendIx(
  solana: SolanaService,
  args: {
    vault: PublicKey;
    signer: PublicKey;
    amount: bigint;
    recipientAta: PublicKey;
  },
): Promise<TransactionInstruction> {
  return solana.program.methods
    .proposeSpend(new BN(args.amount.toString()))
    .accountsPartial({
      vault: args.vault,
      signer: args.signer,
      recipientAta: args.recipientAta,
    })
    .instruction();
}

export async function approveSpendIx(
  solana: SolanaService,
  args: { vault: PublicKey; signer: PublicKey; recipientAta: PublicKey },
): Promise<TransactionInstruction> {
  return solana.program.methods
    .approveSpend()
    .accountsPartial({
      vault: args.vault,
      signer: args.signer,
      recipientAta: args.recipientAta,
      usdcMint: solana.usdcMint,
    })
    .instruction();
}

export async function cancelSpendIx(
  solana: SolanaService,
  args: { vault: PublicKey; signer: PublicKey },
): Promise<TransactionInstruction> {
  return solana.program.methods
    .cancelSpend()
    .accountsPartial({ vault: args.vault, signer: args.signer })
    .instruction();
}

export function transferIx(
  solana: SolanaService,
  args: { owner: PublicKey; to: PublicKey; amount: bigint; from?: PublicKey },
): TransactionInstruction {
  return createTransferCheckedInstruction(
    args.from ?? getAssociatedTokenAddressSync(solana.usdcMint, args.owner),
    solana.usdcMint,
    args.to,
    args.owner,
    args.amount,
    6,
  );
}
