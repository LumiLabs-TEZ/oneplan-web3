// jose is ESM-only and irrelevant here; AuthController only needs to load.
jest.mock('jose', () => ({}));

import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { AuthController } from '../auth/auth.controller';
import { TripVaultController } from '../trip-vault/trip-vault.controller';
import { WalletController } from '../trip-vault/wallet.controller';
import { TripsController } from '../trips/trips.controller';
import { Web3EnabledGuard } from './web3-enabled.guard';

function guardFor(value: unknown): Web3EnabledGuard {
  return new Web3EnabledGuard({
    get: (_key: string, fallback?: unknown) => value ?? fallback,
  } as unknown as ConfigService);
}

const GUARDS = '__guards__';

describe('Web3EnabledGuard (D3 server kill switch)', () => {
  it('answers 404 when WEB3_ENABLED is unset', () => {
    expect(() => guardFor(undefined).canActivate()).toThrow(NotFoundException);
  });

  it('answers 404 when WEB3_ENABLED is false', () => {
    expect(() => guardFor(false).canActivate()).toThrow(NotFoundException);
    expect(() => guardFor('false').canActivate()).toThrow(NotFoundException);
  });

  it('lets requests through when WEB3_ENABLED is true', () => {
    expect(guardFor(true).canActivate()).toBe(true);
    expect(guardFor('true').canActivate()).toBe(true);
  });

  describe('is attached to every web3 route', () => {
    const has = (target: object) =>
      (Reflect.getMetadata(GUARDS, target) as unknown[] | undefined)?.includes(
        Web3EnabledGuard,
      ) ?? false;

    it('all /trips/:id/vault/* and /wallet* routes (class level)', () => {
      expect(has(TripVaultController)).toBe(true);
      expect(has(WalletController)).toBe(true);
    });

    it('/auth/wallet-token', () => {
      expect(has(AuthController.prototype.getWalletToken)).toBe(true);
    });

    it('the vault-leave and end-request endpoints on trips', () => {
      const proto = TripsController.prototype;
      for (const name of [
        'clearVaultLeave',
        'announceVaultLeave',
        'listVaultLeaveRequests',
        'confirmVaultLeave',
        'requestTripEnd',
        'getTripEndRequest',
        'getTripEndReview',
        'castTripEndVote',
      ] as const) {
        expect({ name, guarded: has(proto[name]) }).toEqual({
          name,
          guarded: true,
        });
      }
    });

    it('but not the classic trip routes (flag-off parity)', () => {
      const proto = TripsController.prototype;
      for (const name of [
        'createTrip',
        'updateTrip',
        'getLeavePreview',
        'removeMember',
      ] as const) {
        if (typeof proto[name] === 'function') {
          expect(has(proto[name])).toBe(false);
        }
      }
    });
  });
});
