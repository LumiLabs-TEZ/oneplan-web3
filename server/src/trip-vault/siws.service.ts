import { createHash, randomBytes } from 'node:crypto';
import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PublicKey } from '@solana/web3.js';
import { verifySignIn } from '@solana/wallet-standard-util';

export const SIWS_CHALLENGE_TTL_SECONDS = 300;
const AUDIENCE = 'oneplan-siws-challenge';

export interface SiwsInput {
  domain: string;
  statement: string;
  uri: string;
  version: string;
  chainId: string;
  nonce: string;
  issuedAt: string;
  expirationTime: string;
}

type SignInInput = Parameters<typeof verifySignIn>[0];
type SignInOutput = Parameters<typeof verifySignIn>[1];

/**
 * Sign-In-With-Solana for linking a wallet the user brings (MWA). Stateless: the exact input
 * the wallet signs travels inside a short-lived challenge token, so verification rebuilds it
 * from the token and never trusts what the client says it was asked to sign.
 */
@Injectable()
export class SiwsService {
  private readonly jwt: JwtService;
  private readonly domain: string;
  private readonly chainId: string;

  constructor(config: ConfigService) {
    // Derived, never JWT_SECRET itself: a {sub: userId} token signed with the access-token key
    // would pass JwtAuthGuard as a bearer token for that user.
    const secret = createHash('sha256')
      .update(`${config.getOrThrow<string>('JWT_SECRET')}:siws-challenge`)
      .digest('hex');
    this.jwt = new JwtService({
      secret,
      signOptions: {
        algorithm: 'HS256',
        audience: AUDIENCE,
        expiresIn: SIWS_CHALLENGE_TTL_SECONDS,
      },
      verifyOptions: { algorithms: ['HS256'], audience: AUDIENCE },
    });
    this.domain = config.get<string>('SIWS_DOMAIN') || 'oneplan.space';
    this.chainId = config.get<string>('SIWS_CHAIN_ID') || 'solana:devnet';
  }

  async createChallenge(
    userId: number,
    now: Date = new Date(),
  ): Promise<{ input: SiwsInput; challengeToken: string }> {
    const input: SiwsInput = {
      domain: this.domain,
      statement: 'Link this wallet to your OnePlan account',
      uri: `https://${this.domain}`,
      version: '1',
      chainId: this.chainId,
      nonce: randomBytes(16).toString('hex'),
      issuedAt: now.toISOString(),
      expirationTime: new Date(
        now.getTime() + SIWS_CHALLENGE_TTL_SECONDS * 1000,
      ).toISOString(),
    };
    const challengeToken = await this.jwt.signAsync({ sub: userId, input });
    return { input, challengeToken };
  }

  async verify(
    userId: number,
    body: {
      challengeToken: string;
      address: string;
      signedMessage: string;
      signature: string;
    },
  ): Promise<string> {
    let payload: { sub: number; input: SiwsInput };
    try {
      payload = await this.jwt.verifyAsync(body.challengeToken);
    } catch {
      throw new UnauthorizedException({ code: 'siws_challenge_invalid' });
    }
    if (payload.sub !== userId) {
      throw new UnauthorizedException({ code: 'siws_challenge_invalid' });
    }

    const publicKey = Buffer.from(body.address, 'base64');
    if (publicKey.length !== 32) {
      throw new BadRequestException({ code: 'siws_bad_address' });
    }
    const address = new PublicKey(publicKey).toBase58();
    const input: SignInInput = { ...payload.input, address };
    const output: SignInOutput = {
      account: { address, publicKey, chains: [], features: [] },
      signedMessage: Buffer.from(body.signedMessage, 'base64'),
      signature: Buffer.from(body.signature, 'base64'),
    };
    // verifySignIn re-derives the message from `input` + the signed text, so a wallet that
    // signed a different domain/nonce/statement fails here, then checks the ed25519 signature.
    // It throws (rather than returning false) on a wrong-length signature or a malformed key;
    // that is the same bad signature, not a server error.
    let valid: boolean;
    try {
      valid = verifySignIn(input, output);
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new UnauthorizedException({ code: 'siws_signature_invalid' });
    }
    return address;
  }
}
