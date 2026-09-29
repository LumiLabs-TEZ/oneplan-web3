import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import type { FastifyRequest } from 'fastify';

/**
 * Validates Google Cloud Pub/Sub push requests via OIDC token.
 *
 * When Pub/Sub pushes a message to a webhook, it includes an `Authorization: Bearer <token>`
 * header. This token is an OpenID Connect (OIDC) JWT signed by Google.
 *
 * We verify:
 * 1. The token is valid and signed by Google.
 * 2. The `audience` (aud) matches the URL or audience string configured in GCP Pub/Sub.
 */
@Injectable()
export class GooglePubSubGuard implements CanActivate {
  private readonly logger = new Logger(GooglePubSubGuard.name);
  private readonly oAuth2Client = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    // We expect the token in the standard Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn(
        'Missing or invalid Authorization header in Pub/Sub webhook',
      );
      throw new UnauthorizedException('Missing or invalid token');
    }

    const token = authHeader.split(' ')[1];

    // The audience expected is typically the full URL of the webhook,
    // but GCP allows configuring a custom audience string.
    const expectedAudience = this.configService.get<string>(
      'GOOGLE_PUBSUB_AUDIENCE',
    );
    if (!expectedAudience) {
      this.logger.warn(
        'GOOGLE_PUBSUB_AUDIENCE is not configured, rejecting all Pub/Sub requests',
      );
      throw new UnauthorizedException('Pub/Sub verification not configured');
    }

    try {
      // verifyIdToken automatically fetches Google's public keys and verifies the JWT signature
      const ticket = await this.oAuth2Client.verifyIdToken({
        idToken: token,
        audience: expectedAudience,
      });

      const payload = ticket.getPayload();

      // Ensure the token issuer is Google
      if (
        payload?.iss !== 'https://accounts.google.com' &&
        payload?.iss !== 'accounts.google.com'
      ) {
        throw new Error(`Invalid issuer: ${payload?.iss}`);
      }

      // We could optionally verify the `email` claim if we tied the Pub/Sub subscription to a specific Service Account

      return true;
    } catch (error) {
      this.logger.error('Pub/Sub OIDC token verification failed', error);
      throw new UnauthorizedException('Invalid Pub/Sub token');
    }
  }
}
