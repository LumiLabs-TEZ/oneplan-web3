import { ConfigService } from '@nestjs/config';
import {
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
} from '@solana/web3.js';
import { getAssociatedTokenAddressSync } from '@solana/spl-token';
import bs58 from 'bs58';
import { SolanaService } from './solana.service';

const PROGRAM_ID = 'HcBimMiXCgDnBabhsyoq99g1WqzNSEuiiNMoUvXrtLAL';
const USDC_MINT = '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU';

function noop(service: SolanaService) {
  return SystemProgram.transfer({
    fromPubkey: service.feePayer.publicKey,
    toPubkey: Keypair.generate().publicKey,
    lamports: 1,
  });
}

function configWith(overrides: Record<string, string> = {}): ConfigService {
  const values: Record<string, string> = {
    SOLANA_RPC_URL: 'https://api.devnet.solana.com',
    SOLANA_USDC_MINT: USDC_MINT,
    SOLANA_COMMITMENT: 'confirmed',
    SOLANA_FEE_PAYER_SECRET_KEY: bs58.encode(Keypair.generate().secretKey),
    ...overrides,
  };
  return {
    get: (k: string, d?: string) => values[k] ?? d,
    getOrThrow: (k: string) => {
      const v = values[k];
      if (v === undefined) throw new Error(`missing ${k}`);
      return v;
    },
  } as ConfigService;
}

describe('SolanaService', () => {
  it('reports configured when a fee payer key is present', () => {
    const service = new SolanaService(configWith());
    expect(service.isConfigured).toBe(true);
    expect(service.program.programId.toBase58()).toBe(PROGRAM_ID);
    expect(service.usdcMint.toBase58()).toBe(USDC_MINT);
  });

  it('reports unconfigured when the fee payer key is empty', () => {
    const service = new SolanaService(
      configWith({ SOLANA_FEE_PAYER_SECRET_KEY: '' }),
    );
    expect(service.isConfigured).toBe(false);
  });

  it('throws rather than signing when no fee payer is configured', () => {
    const service = new SolanaService(
      configWith({ SOLANA_FEE_PAYER_SECRET_KEY: '' }),
    );
    expect(() => service.feePayer).toThrow(/not configured/i);
  });

  it('derives the vault PDA the same way the program does', () => {
    const service = new SolanaService(configWith());
    const seed = Buffer.alloc(8);
    seed.writeBigUInt64LE(1001n);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from('vault'), seed],
      new PublicKey(PROGRAM_ID),
    );
    expect(service.vaultPda(1001).toBase58()).toBe(expected.toBase58());
  });

  it('derives the treasury ATA from the fee payer by default', () => {
    const service = new SolanaService(configWith());
    const expected = getAssociatedTokenAddressSync(
      service.usdcMint,
      service.feePayer.publicKey,
    );
    expect(service.treasuryAta().toBase58()).toBe(expected.toBase58());
  });

  it('exposes cancelSpend among the program instructions', () => {
    const service = new SolanaService(configWith());
    expect(Object.keys(service.program.methods)).toContain('cancelSpend');
    expect(Object.keys(service.program.methods)).toContain('setMemberRole');
    expect(Object.keys(service.program.methods)).toContain('payoutLeave');
    // 13 instructions on the deployed program (see solana/programs/oneplan-vault
    // /src/instructions.rs): this assertion was never actually run before this
    // port (the branch's own dossier notes server tests were never executed)
    // and was off by one.
    expect(Object.keys(service.program.methods)).toHaveLength(13);
  });

  describe('S8: bad config disables the feature instead of crashing boot', () => {
    it('does not throw on a malformed fee payer key', () => {
      const service = new SolanaService(
        configWith({ SOLANA_FEE_PAYER_SECRET_KEY: 'not-base58-!!' }),
      );
      expect(service.isConfigured).toBe(false);
    });

    it('does not throw on a malformed USDC mint, and stays off', () => {
      const service = new SolanaService(
        configWith({ SOLANA_USDC_MINT: 'x'.repeat(40) }),
      );
      expect(service.isConfigured).toBe(false);
    });

    it('treats empty RPC url / mint / commitment as unset', () => {
      const service = new SolanaService(
        configWith({
          SOLANA_RPC_URL: '',
          SOLANA_USDC_MINT: '',
          SOLANA_COMMITMENT: '',
        }),
      );
      expect(service.usdcMint.toBase58()).toBe(USDC_MINT);
      expect(service.isConfigured).toBe(true);
    });

    it('refuses to run on default mint / rpc in production', () => {
      const service = new SolanaService(
        configWith({
          NODE_ENV: 'production',
          SOLANA_RPC_URL: '',
          SOLANA_USDC_MINT: '',
        }),
      );
      expect(service.isConfigured).toBe(false);
    });

    it('a malformed receiver key is a 503, not a crash', () => {
      const service = new SolanaService(
        configWith({ SOLANA_RECEIVER_SECRET_KEY: 'garbage!!' }),
      );
      expect(() => service.receiverKeypairOrThrow).toThrow(/not valid/i);
    });
  });

  describe('D3: kill switch', () => {
    it('is off unless WEB3_ENABLED is true', () => {
      expect(new SolanaService(configWith()).isEnabled).toBe(false);
      expect(
        new SolanaService(configWith({ WEB3_ENABLED: 'false' })).isEnabled,
      ).toBe(false);
      expect(
        new SolanaService(configWith({ WEB3_ENABLED: 'true' })).isEnabled,
      ).toBe(true);
    });
  });

  // S4: confirmTransaction resolves (does not reject) for a landed-but-failed tx.
  describe('S4: a landed-but-failed transaction is an error', () => {
    function withConfirm(value: { err: unknown }) {
      const service = new SolanaService(configWith());
      const conn = service.connection as unknown as Record<string, jest.Mock>;
      conn.confirmTransaction = jest.fn().mockResolvedValue({ value });
      conn.getBlockHeight = jest.fn().mockResolvedValue(1);
      conn.getLatestBlockhash = jest.fn().mockResolvedValue({
        blockhash: Keypair.generate().publicKey.toBase58(),
        lastValidBlockHeight: 9,
      });
      conn.sendRawTransaction = jest.fn().mockResolvedValue('sig');
      return service;
    }

    function tx(service: SolanaService): string {
      const t = new Transaction();
      t.recentBlockhash = Keypair.generate().publicKey.toBase58();
      t.feePayer = service.feePayer.publicKey;
      t.sign(service.feePayer);
      return t.serialize().toString('base64');
    }

    it('confirmSigned throws when value.err is set', async () => {
      const service = withConfirm({ err: { InstructionError: [0, 'Custom'] } });
      await expect(service.confirmSigned(tx(service), 'sig')).rejects.toThrow(
        /failed on chain/,
      );
    });

    it('confirmSigned resolves for a clean confirmation', async () => {
      const service = withConfirm({ err: null });
      await expect(
        service.confirmSigned(tx(service), 'sig'),
      ).resolves.toBeUndefined();
    });

    it('sendAsFeePayer throws when value.err is set', async () => {
      const service = withConfirm({ err: 'AccountNotFound' });
      await expect(service.sendAsFeePayer([noop(service)])).rejects.toThrow(
        /failed on chain/,
      );
    });

    it('sendAsFeePayer returns the signature on success', async () => {
      const service = withConfirm({ err: null });
      await expect(service.sendAsFeePayer([noop(service)])).resolves.toBe(
        'sig',
      );
    });
  });
});
