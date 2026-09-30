import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isIP } from 'node:net';
import * as geoip from 'geoip-lite';
import { InviteStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SolanaService } from '../solana/solana.service';

/** Countries whose IPs may not create or enable web3 trips. */
const BLOCKED_COUNTRIES = new Set(['VN']);

function stripV4Mapped(ip: string): string {
  return ip.toLowerCase().startsWith('::ffff:') ? ip.slice(7) : ip;
}

/** Loopback / RFC1918 / link-local / ULA: addresses GeoIP can never place. */
export function isPrivateIp(rawIp: string): boolean {
  const ip = stripV4Mapped(rawIp);
  const family = isIP(ip);
  if (family === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 169 && b === 254)
    );
  }
  if (family === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80')
    );
  }
  return false;
}

/**
 * Decides who gets web3 at all (per request IP, no KYC). A non-eligible IP
 * sees no web3 anywhere: it cannot create or enable web3, cannot join a web3
 * trip, and is refused on the vault/wallet/end-trip/leave routes even inside
 * a web3 trip it already belongs to (see Web3TripGuard); it must use a VPN.
 *
 * Fails closed: unknown country, unparsable IP, or a private IP with no
 * WEB3_DEV_COUNTRY_OVERRIDE all answer "not eligible".
 */
@Injectable()
export class Web3EligibilityService {
  constructor(
    private readonly config: ConfigService,
    private readonly solana: SolanaService,
    private readonly prisma: PrismaService,
  ) {}

  /** Kill switch on AND server keys present. Independent of the caller. */
  get serverReady(): boolean {
    return this.solana.isEnabled && this.solana.isConfigured;
  }

  countryOf(ip: string | undefined): string | null {
    if (!ip) return null;
    const normalized = stripV4Mapped(ip);
    if (isIP(normalized) === 0) return null;
    if (isPrivateIp(normalized)) {
      const override = this.config.get<string>('WEB3_DEV_COUNTRY_OVERRIDE');
      return override ? override.toUpperCase() : null;
    }
    return geoip.lookup(normalized)?.country ?? null;
  }

  isEligible(ip: string | undefined): boolean {
    if (!this.serverReady) return false;
    const country = this.countryOf(ip);
    return country !== null && !BLOCKED_COUNTRIES.has(country);
  }

  /** True when the user has accepted membership in at least one web3 trip. */
  async hasWeb3Trip(userId: number): Promise<boolean> {
    if (!this.serverReady) return false;
    const row = await this.prisma.tripMember.findFirst({
      where: {
        userId,
        inviteStatus: InviteStatus.ACCEPTED,
        trip: { web3: true },
      },
      select: { tripId: true },
    });
    return row !== null;
  }
}
