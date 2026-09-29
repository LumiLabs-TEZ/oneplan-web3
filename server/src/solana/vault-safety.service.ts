import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  InviteStatus,
  VaultStatus,
  VaultTxKind,
  VaultTxStatus,
} from '@prisma/client';
import { PublicKey } from '@solana/web3.js';

import { PrismaService } from '../prisma/prisma.service';
import { SolanaService } from './solana.service';

/**
 * Guards that keep USDC from being stranded in a vault nothing can reach.
 *
 * Lives beside SolanaService (both global) rather than in the trip-vault
 * module so AuthService and TripsService can use it without importing
 * TripVaultModule — that module reaches AuthModule through RealtimeModule.
 */
@Injectable()
export class VaultSafetyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly solana: SolanaService,
  ) {}

  /**
   * Throws when the trip's vault still holds funds on chain. Called before a
   * trip is deleted so USDC cannot be stranded.
   *
   * A CLOSED vault is skipped (settlement closes its token account, so reading
   * it would throw forever), and a missing token account counts as empty. Any
   * other read failure is an RPC problem: fail closed but retryable (503), not
   * a permanent 500.
   */
  async assertTripDeletable(tripId: number): Promise<void> {
    const vault = await this.prisma.tripVault.findUnique({ where: { tripId } });
    if (!vault || vault.status === VaultStatus.CLOSED) {
      return;
    }
    let balance: bigint;
    try {
      balance = await this.solana.getTokenBalance(new PublicKey(vault.usdcAta));
    } catch (error) {
      if (!String(error).includes('could not find account')) {
        throw new ServiceUnavailableException(
          'Could not verify the group wallet balance right now; try again shortly',
        );
      }
      balance = 0n;
    }
    if (balance > 0n) {
      throw new BadRequestException(
        'Settle or withdraw the trip vault before deleting the trip',
      );
    }
  }

  /**
   * A trip with a group wallet ends only through the end-trip vote (which also
   * settles the vault). A plain status PATCH would leave the USDC unreachable.
   */
  async assertEndableWithoutConsensus(tripId: number): Promise<void> {
    const vault = await this.prisma.tripVault.findUnique({
      where: { tripId },
      select: { status: true },
    });
    if (vault && vault.status !== VaultStatus.CLOSED) {
      throw new BadRequestException(
        'This trip has a group wallet: end it with the end-trip vote so the money is settled',
      );
    }
  }

  /**
   * Account deletion cascades the user's trips and orphans their rows in other
   * people's trips. Refuse while either would strand money:
   * - a trip they own still holds funds (same rule as deleting the trip);
   * - they are still a member of someone else's trip with an open vault and
   *   have deposited into it (their deposit rows would lose the user and never
   *   be repaid). They leave through the vault-leave flow first.
   */
  async assertAccountDeletable(userId: number): Promise<void> {
    const owned = await this.prisma.trip.findMany({
      where: { createdById: userId, vault: { isNot: null } },
      select: { id: true },
    });
    for (const trip of owned) {
      await this.assertTripDeletable(trip.id);
    }

    const stranded = await this.prisma.vaultTransaction.findFirst({
      where: {
        userId,
        kind: VaultTxKind.DEPOSIT,
        status: VaultTxStatus.CONFIRMED,
        tripVault: {
          status: { not: VaultStatus.CLOSED },
          trip: {
            createdById: { not: userId },
            members: { some: { userId, inviteStatus: InviteStatus.ACCEPTED } },
          },
        },
      },
      select: { id: true },
    });
    if (stranded) {
      throw new BadRequestException(
        'Leave your trips’ group wallets (or ask the host to settle them) before deleting your account',
      );
    }
  }
}
