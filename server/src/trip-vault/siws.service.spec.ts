import { createPrivateKey, sign as edSign } from 'node:crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@solana/web3.js';
import { createSignInMessage } from '@solana/wallet-standard-util';

import { SiwsService } from './siws.service';

const SECRET = 'x'.repeat(40);
const config = (extra: Record<string, string> = {}) =>
  new ConfigService({
    JWT_SECRET: SECRET,
    SIWS_DOMAIN: 'oneplan.space',
    ...extra,
  });

/** Ed25519 sign with a Solana keypair via node:crypto (PKCS#8 wrapper around the 32-byte seed). */
function signWith(kp: Keypair, message: Uint8Array): Buffer {
  const seed = Buffer.from(kp.secretKey.slice(0, 32));
  const der = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    seed,
  ]);
  return edSign(
    null,
    message,
    createPrivateKey({ key: der, format: 'der', type: 'pkcs8' }),
  );
}

async function signedOutput(
  service: SiwsService,
  userId: number,
  kp = Keypair.generate(),
) {
  const { input, challengeToken } = await service.createChallenge(userId);
  const message = createSignInMessage({
    ...input,
    address: kp.publicKey.toBase58(),
  });
  return {
    kp,
    body: {
      challengeToken,
      address: Buffer.from(kp.publicKey.toBytes()).toString('base64'),
      signedMessage: Buffer.from(message).toString('base64'),
      signature: signWith(kp, message).toString('base64'),
    },
  };
}

describe('SiwsService', () => {
  it('verifies a correctly signed sign-in and returns the base58 address', async () => {
    const service = new SiwsService(config());
    const { kp, body } = await signedOutput(service, 7);
    await expect(service.verify(7, body)).resolves.toBe(
      kp.publicKey.toBase58(),
    );
  });

  it('rejects a challenge issued to another user', async () => {
    const service = new SiwsService(config());
    const { body } = await signedOutput(service, 7);
    await expect(service.verify(8, body)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a tampered message', async () => {
    const service = new SiwsService(config());
    const { body } = await signedOutput(service, 7);
    const text = Buffer.from(body.signedMessage, 'base64').toString('utf8');
    const tampered = Buffer.from(
      text.replace('oneplan.space', 'evil.example'),
    ).toString('base64');
    await expect(
      service.verify(7, { ...body, signedMessage: tampered }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a signature from a different key', async () => {
    const service = new SiwsService(config());
    const { body } = await signedOutput(service, 7);
    const other = Keypair.generate();
    const sig = signWith(
      other,
      Buffer.from(body.signedMessage, 'base64'),
    ).toString('base64');
    await expect(
      service.verify(7, { ...body, signature: sig }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a message naming another address, even when that key signed it', async () => {
    const service = new SiwsService(config());
    const { body } = await signedOutput(service, 7);
    const other = Keypair.generate();
    const sig = signWith(
      other,
      Buffer.from(body.signedMessage, 'base64'),
    ).toString('base64');
    const address = Buffer.from(other.publicKey.toBytes()).toString('base64');
    await expect(
      service.verify(7, { ...body, address, signature: sig }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a malformed signature as unauthorized, not a server error', async () => {
    const service = new SiwsService(config());
    const { body } = await signedOutput(service, 7);
    const short = Buffer.alloc(10).toString('base64');
    await expect(
      service.verify(7, { ...body, signature: short }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an expired challenge', async () => {
    const service = new SiwsService(config());
    const { body } = await signedOutput(service, 7);
    jest.useFakeTimers({ now: Date.now() + 6 * 60_000 });
    try {
      await expect(service.verify(7, body)).rejects.toThrow(
        UnauthorizedException,
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('challenge tokens are not valid access tokens', async () => {
    const service = new SiwsService(config());
    const { challengeToken } = await service.createChallenge(7);
    await expect(
      new JwtService({ secret: SECRET }).verifyAsync(challengeToken),
    ).rejects.toThrow();
  });
});
