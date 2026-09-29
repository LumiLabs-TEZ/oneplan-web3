import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import {
  ThrottlerGuard,
  ThrottlerModule,
  ThrottlerModuleOptions,
} from '@nestjs/throttler';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { WalletTokenService } from './wallet-token.service';
import { JwtTokenService } from './jwt.service';
import { AppleAuthService } from './apple-auth.service';
import { GoogleAuthService } from './google-auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Web3Module } from '../web3/web3.module';
import { StorageModule } from '../storage/storage.module';
import { ScanCreditModule } from '../scan-credit/scan-credit.module';
import { DeletedUsersModule } from '../deleted-users/deleted-users.module';

@Module({
  imports: [
    StorageModule,
    Web3Module,
    ScanCreditModule,
    DeletedUsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): JwtModuleOptions => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // Pin the symmetric algorithm on both sign and verify. Without an
        // explicit allowlist, a misconfigured key store or a future
        // `jsonwebtoken` downgrade could accept `alg: none` or asymmetric
        // alternatives forged against a leaked public key.
        signOptions: {
          algorithm: 'HS256',
          expiresIn: config.get('JWT_ACCESS_EXPIRATION', '15m'),
        },
        verifyOptions: {
          algorithms: ['HS256'],
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService): ThrottlerModuleOptions => [
        { ttl: 60000, limit: config.get<number>('THROTTLE_LIMIT', 10) },
      ],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    WalletTokenService,
    JwtTokenService,
    AppleAuthService,
    GoogleAuthService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
  exports: [JwtTokenService],
})
export class AuthModule {}
