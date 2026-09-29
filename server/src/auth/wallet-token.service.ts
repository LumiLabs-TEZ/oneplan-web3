import { createPublicKey, KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';

/**
 * Issues the short-lived token Privy exchanges for a wallet session.
 *
 * Deliberately separate from the app's own access token, which stays HS256.
 * Privy's custom auth only verifies RS256 or ES256 through a JWKS endpoint, and
 * re-signing the app's tokens would invalidate every refresh token in the wild
 * — thirty days of them — to unlock one feature.
 *
 * So this is a second, single-purpose key: five minutes, one claim, no
 * authority over anything but obtaining a wallet session. If it leaks it opens
 * nothing else, and if this key is ever rotated only the vault stops working
 * while sign-in carries on.
 */
@Injectable()
export class WalletTokenService {
  private readonly logger = new Logger(WalletTokenService.name);
  private readonly privateKey: string | null;
  private readonly publicKey: KeyObject | null;
  /** Stable across restarts so a cached JWKS stays valid. */
  private readonly keyId = 'oneplan-wallet-1';

  constructor(
    config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    const path = config.get<string>('WALLET_JWT_PRIVATE_KEY_FILE');
    let privateKey: string | null = null;
    try {
      privateKey = path ? readFileSync(path, 'utf8') : null;
    } catch {
      // Absent in deployments that do not run the vault. Every call then fails
      // with a clear 503 rather than the process refusing to boot.
      this.logger.warn(
        `wallet token key not readable at ${path}; the group wallet is disabled`,
      );
    }
    // A malformed PEM must disable the wallet, not crash boot.
    let publicKey: KeyObject | null = null;
    if (privateKey) {
      try {
        publicKey = createPublicKey({ key: privateKey, format: 'pem' });
      } catch {
        this.logger.error(
          `wallet token key at ${path} is not a valid PEM; the group wallet is disabled`,
        );
        privateKey = null;
      }
    }
    this.privateKey = privateKey;
    this.publicKey = publicKey;
  }

  get isConfigured(): boolean {
    return this.privateKey !== null;
  }

  /** A token identifying the user to Privy, and nothing else. */
  issue(userId: number): string {
    if (!this.privateKey) {
      throw new ServiceUnavailableException(
        'The group wallet is not configured on this server',
      );
    }
    return this.jwt.sign(
      {},
      {
        secret: this.privateKey,
        algorithm: 'RS256',
        subject: String(userId),
        expiresIn: '5m',
        keyid: this.keyId,
        issuer: 'oneplan',
      },
    );
  }

  /**
   * The public half, in the shape Privy fetches to verify our tokens.
   *
   * Derived from the private key rather than stored separately, so the two can
   * never disagree.
   */
  jwks(): { keys: object[] } {
    if (!this.publicKey) {
      return { keys: [] };
    }
    const jwk = this.publicKey.export({ format: 'jwk' });
    return {
      keys: [{ ...jwk, use: 'sig', alg: 'RS256', kid: this.keyId }],
    };
  }
}
