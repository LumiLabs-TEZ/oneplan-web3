import { CanActivate, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Server-side kill switch for the web3 surface (WEB3_ENABLED, default false).
 *
 * Answers 404 — the route "does not exist" — rather than 503, so a prod server
 * that has not opted in is indistinguishable from one that never had the
 * feature, whatever SOLANA_* secrets are or are not present.
 */
@Injectable()
export class Web3EnabledGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(): boolean {
    const value: unknown = this.config.get('WEB3_ENABLED', false);
    if (value !== true && value !== 'true') {
      throw new NotFoundException();
    }
    return true;
  }
}
