import { BadRequestException } from '@nestjs/common';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';

import {
  approveSpendIx,
  cancelSpendIx,
  depositIx,
  proposeSpendIx,
  signTx,
  spendIx,
  testSolana,
  transferIx,
} from './testing/vault-tx';
import {
  assertInstructionAccounts,
  decodeTransferChecked,
  decodeVaultInstruction,
  transactionSignature,
} from './tx-verify';

describe('tx-verify (audit S1-S3 primitives)', () => {
  const solana = testSolana();
  const feePayer = solana.feePayer.publicKey;
  const programId = solana.program.programId;
  const member = Keypair.generate();
  const vault = Keypair.generate().publicKey;

  it('decodes a deposit: instruction, amount, accounts and signer come from the bytes', async () => {
    const ix = await depositIx(solana, {
      vault,
      owner: member.publicKey,
      amount: 12_345_678n,
    });
    const tx = signTx(solana, [ix], [member]);

    const decoded = decodeVaultInstruction(tx, feePayer, programId, 'deposit');

    expect(decoded.amountMicro).toBe(12_345_678n);
    expect(decoded.accounts.vault.equals(vault)).toBe(true);
    expect(decoded.accounts.owner.equals(member.publicKey)).toBe(true);
    expect(decoded.signers.some((k) => k.equals(member.publicKey))).toBe(true);
  });

  it('rejects a transaction the member never signed', async () => {
    const ix = await depositIx(solana, {
      vault,
      owner: member.publicKey,
      amount: 1n,
    });
    expect(() =>
      decodeVaultInstruction(
        signTx(solana, [ix], []),
        feePayer,
        programId,
        'deposit',
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects the wrong instruction (a spend presented as a deposit)', async () => {
    const ix = await spendIx(solana, {
      vault,
      signer: member.publicKey,
      amount: 1n,
      recipientAta: Keypair.generate().publicKey,
    });
    expect(() =>
      decodeVaultInstruction(
        signTx(solana, [ix], [member]),
        feePayer,
        programId,
        'deposit',
      ),
    ).toThrow(/not deposit/);
  });

  it('rejects a transaction aimed at another program', () => {
    const ix = SystemProgram.transfer({
      fromPubkey: member.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    });
    expect(() =>
      decodeVaultInstruction(
        signTx(solana, [ix], [member]),
        feePayer,
        programId,
        'deposit',
      ),
    ).toThrow(/different program/);
  });

  it('rejects extra instructions smuggled alongside the expected one', async () => {
    const ix = await depositIx(solana, {
      vault,
      owner: member.publicKey,
      amount: 1n,
    });
    const extra = SystemProgram.transfer({
      fromPubkey: member.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1_000,
    });
    expect(() =>
      decodeVaultInstruction(
        signTx(solana, [ix, extra], [member]),
        feePayer,
        programId,
        'deposit',
      ),
    ).toThrow(/exactly one instruction/);
  });

  it('rejects a transaction whose fee payer is not this server', async () => {
    const ix = await depositIx(solana, {
      vault,
      owner: member.publicKey,
      amount: 1n,
    });
    const tx = new Transaction().add(ix);
    tx.feePayer = member.publicKey;
    tx.recentBlockhash = Keypair.generate().publicKey.toBase58();
    tx.sign(member);
    expect(() =>
      decodeVaultInstruction(
        tx.serialize().toString('base64'),
        feePayer,
        programId,
        'deposit',
      ),
    ).toThrow(/fee payer/);
  });

  it('rejects garbage', () => {
    expect(() =>
      decodeVaultInstruction('not-base64!!', feePayer, programId, 'deposit'),
    ).toThrow(BadRequestException);
  });

  it('decodes propose / approve / cancel', async () => {
    const recipientAta = Keypair.generate().publicKey;
    const propose = decodeVaultInstruction(
      signTx(
        solana,
        [
          await proposeSpendIx(solana, {
            vault,
            signer: member.publicKey,
            amount: 9n,
            recipientAta,
          }),
        ],
        [member],
      ),
      feePayer,
      programId,
      'propose_spend',
    );
    expect(propose.amountMicro).toBe(9n);
    expect(propose.accounts.recipient_ata.equals(recipientAta)).toBe(true);

    const approve = decodeVaultInstruction(
      signTx(
        solana,
        [
          await approveSpendIx(solana, {
            vault,
            signer: member.publicKey,
            recipientAta,
          }),
        ],
        [member],
      ),
      feePayer,
      programId,
      'approve_spend',
    );
    expect(approve.amountMicro).toBeNull();

    const cancel = decodeVaultInstruction(
      signTx(
        solana,
        [await cancelSpendIx(solana, { vault, signer: member.publicKey })],
        [member],
      ),
      feePayer,
      programId,
      'cancel_spend',
    );
    expect(cancel.accounts.vault.equals(vault)).toBe(true);
  });

  it('assertInstructionAccounts names the first mismatching account', async () => {
    const decoded = decodeVaultInstruction(
      signTx(
        solana,
        [
          await depositIx(solana, {
            vault,
            owner: member.publicKey,
            amount: 1n,
          }),
        ],
        [member],
      ),
      feePayer,
      programId,
      'deposit',
    );
    expect(() =>
      assertInstructionAccounts(
        decoded,
        [['vault', Keypair.generate().publicKey]],
        'Deposit',
      ),
    ).toThrow(/vault is not the expected account/);
    expect(() =>
      assertInstructionAccounts(decoded, [['vault', vault]], 'Deposit'),
    ).not.toThrow();
  });

  it('decodes a transferChecked (personal payment)', () => {
    const to = getAssociatedTokenAddressSync(
      solana.usdcMint,
      Keypair.generate().publicKey,
    );
    const decoded = decodeTransferChecked(
      signTx(
        solana,
        [transferIx(solana, { owner: member.publicKey, to, amount: 777n })],
        [member],
      ),
      feePayer,
    );
    expect(decoded.amountMicro).toBe(777n);
    expect(decoded.destination.equals(to)).toBe(true);
    expect(decoded.authority.equals(member.publicKey)).toBe(true);
    expect(decoded.decimals).toBe(6);
  });

  it('transactionSignature is the fee payer signature the chain will index', async () => {
    const tx = signTx(
      solana,
      [
        await depositIx(solana, {
          vault,
          owner: member.publicKey,
          amount: 1n,
        }),
      ],
      [member],
    );
    const parsed = Transaction.from(Buffer.from(tx, 'base64'));
    expect(transactionSignature(tx)).toBe(
      // base58 of signatures[0]
      bs58.encode(parsed.signatures[0].signature as Uint8Array),
    );
  });
});
