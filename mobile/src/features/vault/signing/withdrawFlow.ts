/**
 * Port of `WalletWithdrawService.withdraw(address:amountMicro:)` (`origin/feat/web3-version`) —
 * moves USDC from the caller's personal OnePlan Wallet to any Solana address they name.
 *
 * Unlike the Swift original (which signs and sends without checking the built transaction at
 * all), this composes the build→submit calls with the generic `signAndSubmit` pipeline so the
 * transaction is verified before it is ever signed — the security audit (S-4/S-4b) requires
 * binding what the app checks to what the user typed/confirmed on screen (destination, amount,
 * mint), never to a value the server echoes back.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { type ApiClient, api as defaultApi } from '@/api/client';
import { keys } from '@/api/keys';
import { buildWithdrawal, submitWithdrawal, type WithdrawalResultDto } from '../api/walletWithdraw';
import { VAULT_USDC_MINT } from '../solana/constants';
import { deriveAssociatedTokenAddress } from '../solana/pda';
import { SolanaDecodeError } from '../solana/shortVec';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  decodeTransaction,
  type DecodedInstruction,
  SPL_TOKEN_PROGRAM_ID,
  verifyTokenTransferInstruction,
} from '../solana/transactionVerifier';
import { ensureVaultWallet } from '../wallet/walletHandle';
import { signAndSubmit } from './pipeline';

export interface VerifyWithdrawalParams {
  base64: string;
  /** `WithdrawalTxDto.createsRecipientAccount` — the server prepends an account-creation
   *  instruction when the recipient has never held USDC. */
  createsRecipientAccount: boolean;
  expectedAmountMicro: bigint;
  expectedSource: string;
  expectedDestination: string;
  expectedOwner: string;
  /** The address the user typed — the wallet that must own the account being created. */
  recipientAddress: string;
}

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

/**
 * The ATA program's `Create` (`[]` legacy / `[0]`) and `CreateIdempotent` (`[1]`) forms. Anything
 * else — including a `RecoverNested` (`[2]`) — is not "create the recipient's USDC account".
 */
function isCreateAtaData(data: Uint8Array): boolean {
  return data.length === 0 || (data.length === 1 && (data[0] === 0 || data[0] === 1));
}

/**
 * The signed create-ATA instruction is checked as strictly as the transfer: data tag, and the
 * accounts `[payer, ata, wallet, mint, systemProgram, tokenProgram(, rent)]` pinned to what the
 * client derived / the user typed. The payer must not be the signing key — a user is never the one
 * paying the rent (the server's fee payer is).
 */
function verifyCreateRecipientAccount(
  create: DecodedInstruction,
  params: VerifyWithdrawalParams,
): void {
  if (create.programId !== ASSOCIATED_TOKEN_PROGRAM_ID) throw SolanaDecodeError.unexpectedProgram();
  if (!isCreateAtaData(create.data)) throw SolanaDecodeError.discriminatorMismatch();
  if (create.accountKeys.length < 6 || create.accountKeys.length > 7) {
    throw SolanaDecodeError.argumentMismatch('create accounts');
  }
  const [payer, ata, wallet, mint, system, token] = create.accountKeys;
  if (payer === params.expectedOwner) throw SolanaDecodeError.argumentMismatch('create payer');
  if (ata !== params.expectedDestination) throw SolanaDecodeError.argumentMismatch('create ata');
  if (wallet !== params.recipientAddress) throw SolanaDecodeError.argumentMismatch('create wallet');
  if (mint !== VAULT_USDC_MINT) throw SolanaDecodeError.argumentMismatch('create mint');
  if (system !== SYSTEM_PROGRAM_ID) throw SolanaDecodeError.argumentMismatch('create system');
  if (token !== SPL_TOKEN_PROGRAM_ID) throw SolanaDecodeError.argumentMismatch('create token');
}

/**
 * Structural check for a withdrawal transaction: exactly one `transferChecked`, optionally
 * preceded by one "create the recipient's USDC account" instruction. `expectedDestination` must
 * be derived locally (`deriveAssociatedTokenAddress`) from the address the user confirmed — the
 * server never echoes it, by design, so there is nothing to trust here but the derivation.
 */
export function verifyWithdrawal(params: VerifyWithdrawalParams): void {
  const decoded = decodeTransaction(params.base64);
  const expectedCount = params.createsRecipientAccount ? 2 : 1;
  if (decoded.instructions.length !== expectedCount) {
    throw SolanaDecodeError.instructionCountMismatch();
  }
  if (params.createsRecipientAccount) {
    const create = decoded.instructions[0];
    if (create === undefined) throw SolanaDecodeError.instructionCountMismatch();
    verifyCreateRecipientAccount(create, params);
  }
  const transfer = decoded.instructions[decoded.instructions.length - 1];
  if (transfer === undefined) throw SolanaDecodeError.instructionCountMismatch();
  verifyTokenTransferInstruction({
    instruction: transfer,
    expectedAmountMicro: params.expectedAmountMicro,
    expectedSource: params.expectedSource,
    expectedDestination: params.expectedDestination,
    expectedOwner: params.expectedOwner,
  });
}

export interface WithdrawFromWalletDeps {
  api?: ApiClient;
  /** Injectable for tests; defaults to the live Privy wallet. */
  sign?: (base64Tx: string) => Promise<string>;
}

export async function withdrawFromWallet(
  address: string,
  amountMicro: bigint,
  deps: WithdrawFromWalletDeps = {},
): Promise<WithdrawalResultDto> {
  const api = deps.api ?? defaultApi;

  const ownerPublicKey = await ensureVaultWallet();
  // Source ATA derived from the local key (S-4b): never the server's `wallet.usdcAta`.
  const ownerAta = deriveAssociatedTokenAddress(ownerPublicKey, VAULT_USDC_MINT);

  const { base64Tx: unsignedTx, createsRecipientAccount } = await buildWithdrawal(
    { address, amountMicro: amountMicro.toString() },
    api,
  );
  const destinationAta = deriveAssociatedTokenAddress(address, VAULT_USDC_MINT);

  return signAndSubmit({
    unsignedTx,
    verify: () =>
      verifyWithdrawal({
        base64: unsignedTx,
        createsRecipientAccount,
        expectedAmountMicro: amountMicro,
        expectedSource: ownerAta,
        expectedDestination: destinationAta,
        expectedOwner: ownerPublicKey,
        recipientAddress: address,
      }),
    sign: deps.sign,
    submit: (signedTx) => submitWithdrawal({ signedTx }, api),
  });
}

/** Screen-facing mutation: same cache invalidation as `useSubmitWithdrawal`. */
export function useWithdrawFromWallet(deps: WithdrawFromWalletDeps = {}) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ address, amountMicro }: { address: string; amountMicro: bigint }) =>
      withdrawFromWallet(address, amountMicro, deps),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: keys.wallet.balance }),
        queryClient.invalidateQueries({ queryKey: keys.wallet.history }),
      ]),
  });
}
