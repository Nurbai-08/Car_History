import 'reflect-metadata';
import { Controller, Get, Inject, Module } from '@nestjs/common';
import { NestFactory, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json as expressJson } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { createHash } from 'node:crypto';
import { Db, Errors, requestContext } from './common/core';
import { AccessGuard, AccountController, AuthController, AuthService, Public } from './modules/auth';
import { CarsController, EventsController, HistoryService } from './modules/history';
import { ReportsController, ReportsService } from './modules/reports';
import { DailyController } from './modules/daily';
import { AliasesController } from './modules/aliases';
import { FilesController, FilesService } from './modules/files';
@Controller('health')
class HealthController {
  constructor(@Inject(Db) readonly db: Db) {}
  @Public() @Get('live') live() {
    return { status: 'ok' };
  }
  @Public() @Get('ready') async ready() {
    await this.db.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'connected' };
  }
}
@Module({
  imports: [JwtModule.register({})],
  controllers: [
    AliasesController,
    AuthController,
    AccountController,
    CarsController,
    EventsController,
    ReportsController,
    DailyController,
    FilesController,
    HealthController,
  ],
  providers: [
    Db,
    AuthService,
    HistoryService,
    ReportsService,
    FilesService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
})
export class AppModule {}
export async function bootstrap() {
  for (const name of ['DATABASE_URL', 'JWT_ACCESS_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE', 'FRONTEND_URL'])
    if (!process.env[name]) throw new Error(`Missing environment: ${name}`);
  if (process.env.JWT_ACCESS_SECRET!.length < 32)
    throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
  const frontendOrigins = new Set([process.env.FRONTEND_URL!]);
  if (process.env.NODE_ENV !== 'production') {
    const frontend = new URL(process.env.FRONTEND_URL!);
    if (frontend.hostname === 'localhost') frontendOrigins.add(`http://127.0.0.1:${frontend.port}`);
    if (frontend.hostname === '127.0.0.1') frontendOrigins.add(`http://localhost:${frontend.port}`);
  }
  const app = await NestFactory.create(AppModule, { bodyParser: false, logger: ['error', 'warn'] });
  if (process.env.NODE_ENV === 'production') {
    app.getHttpAdapter().getInstance().set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));
  }
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();
  app.use(
    helmet({ crossOriginResourcePolicy: { policy: 'same-site' }, referrerPolicy: { policy: 'no-referrer' } }),
  );
  app.use(expressJson({ limit: '256kb' }));
  app.use(cookieParser());
  app.use(requestContext);
  app.enableCors({
    origin: [...frontendOrigins],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-CSRF'],
  });
  app.use((req: any, res: any, next: any) => {
    res.setHeader('X-Request-ID', req.requestId);
    res.setHeader('Cache-Control', 'no-store');
    if (req.path.startsWith('/api/v1/public')) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    const started = Date.now();
    res.on('finish', () =>
      console.log(
        JSON.stringify({
          requestId: req.requestId,
          method: req.method,
          route: req.route?.path ?? 'unmatched',
          status: res.statusCode,
          durationMs: Date.now() - started,
        }),
      ),
    );
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (!frontendOrigins.has(req.headers.origin) || req.headers['x-csrf'] !== '1')
    )
      return res
        .status(403)
        .json({ code: 'CSRF_REJECTED', message: 'Недопустимый источник запроса', requestId: req.requestId });
    next();
  });
  const rateResponse = (req: any, res: any) =>
    res
      .status(429)
      .json({
        code: 'RATE_LIMIT',
        message: 'Слишком много запросов. Повторите позже.',
        requestId: req.requestId,
      });
  app.use(
    '/api/v1',
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: true,
      legacyHeaders: false,
      handler: rateResponse,
    }),
  );
  app.use(
    [
      '/api/v1/auth/login',
      '/api/v1/auth/register',
      '/api/v1/auth/forgot-password',
      '/api/v1/auth/reset-password',
      '/api/v1/auth/resend-verification',
    ],
    rateLimit({
      windowMs: 15 * 60000,
      limit: 20,
      standardHeaders: true,
      legacyHeaders: false,
      handler: rateResponse,
    }),
  );
  app.use(
    '/api/v1/auth/login',
    rateLimit({
      windowMs: 15 * 60000,
      limit: 10,
      keyGenerator: (req) =>
        createHash('sha256')
          .update(
            String(req.body?.email ?? '')
              .trim()
              .toLowerCase(),
          )
          .digest('hex'),
      standardHeaders: true,
      legacyHeaders: false,
      handler: rateResponse,
    }),
  );
  app.useGlobalFilters(new Errors());
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('CarHistory API')
      .setDescription('Private routes require a Bearer access token. Mutations require Origin and X-CSRF: 1.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  await app.listen(Number(process.env.PORT ?? 3001), process.env.HOST ?? '127.0.0.1');
  console.log(`CarHistory API ready on ${process.env.PORT ?? 3001}`);
  return app;
}
if (require.main === module)
  bootstrap().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
