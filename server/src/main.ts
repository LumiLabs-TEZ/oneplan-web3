import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { WsAdapter } from '@nestjs/platform-ws';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import multipart from '@fastify/multipart';
import cors from '@fastify/cors';
import { AppModule } from './app.module';
import { scopeUnhandledRejections } from './solana/unhandled-rejection';

async function bootstrap() {
  scopeUnhandledRejections();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    // trustProxy: Caddy terminates TLS in front of the container; without it
    // req.ip is the proxy IP and every visitor shares one throttle bucket.
    new FastifyAdapter({ trustProxy: true }),
  );

  const parseOrigins = (raw: string | undefined): string[] =>
    (raw ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);

  const mergedOrigins = Array.from(
    new Set([
      ...parseOrigins(process.env.DASHBOARD_WEB_ORIGINS),
      ...parseOrigins(process.env.ADMIN_WEB_ORIGINS),
      ...parseOrigins(process.env.TRACTION_WEB_ORIGINS),
    ]),
  );

  await app.register(cors, {
    // origin:[] would block every cross-origin request silently. Falling back
    // to false disables CORS (same-origin only) — fail-closed but visible.
    origin: mergedOrigins.length > 0 ? mergedOrigins : false,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024 },
  });

  app.useWebSocketAdapter(new WsAdapter(app));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // Run module lifecycle shutdown hooks (onModuleDestroy) on SIGTERM/SIGINT so
  // the Telegram long-poll loop stops cleanly on a prod redeploy — otherwise a
  // lingering poller collides with the new one (Telegram 409 Conflict).
  app.enableShutdownHooks();

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('OnePlan API')
      .setDescription('Backend API for the OnePlan travel planning app')
      .setVersion('0.1.0')
      .addServer('http://localhost:3000', 'Local development')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document, {
      jsonDocumentUrl: 'docs/json',
      yamlDocumentUrl: 'docs/yaml',
    });
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port, '0.0.0.0');
}
bootstrap();
