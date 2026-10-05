import {
  Body,
  CanActivate,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Inject,
  Injectable,
  Patch,
  Post,
  Req,
  Res,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { hash as argonHash, verify, argon2id } from 'argon2';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { email, password, registerSchema, loginSchema, currency } from '@carhistory/validation';
import { Db, fail, hash, randomToken, uuid } from '../common/core';
export const Public = () => SetMetadata('public', true);
export const userDto = (u: any) => ({
  id: u.id,
  avatarFileId: u.avatarFileId,
  firstName: u.firstName,
  email: u.email,
  emailVerified: !!u.emailVerifiedAt,
  currency: u.currency,
  timezone: u.timezone,
  emailNotifications: u.emailNotifications,
});
const options = { type: argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 };
const expires = (days: number) => new Date(Date.now() + days * 86400000);
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/v1/auth',
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
});
@Injectable()
export class AuthService {
  constructor(
    @Inject(Db) readonly db: Db,
    @Inject(JwtService) readonly jwt: JwtService,
  ) {}
  async access(userId: string, sid: string) {
    return this.jwt.signAsync(
      { sub: userId, sid },
      {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '15m',
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      },
    );
  }
  async session(user: any, req: Request, res: Response) {
    const token = randomToken();
    const s = await this.db.session.create({
      data: {
        userId: user.id,
        userAgent: (req.headers['user-agent'] ?? 'Неизвестное устройство').slice(0, 500),
        expiresAt: expires(30),
        tokens: { create: { hash: hash(token), expiresAt: expires(30) } },
      },
    });
    res.cookie('ch_refresh', token, { ...cookieOptions(), maxAge: 30 * 86400000 });
    return { accessToken: await this.access(user.id, s.id), user: userDto(user) };
  }
  async issueEmail(userId: string, address: string, purpose: string, payload?: string) {
    const token = randomToken();
    const routes: Record<string, string> = {
      reset: 'reset-password',
      verify: 'verify-email',
      email: 'verify-email',
    };
    await this.db.$transaction(async (tx) => {
      await tx.authToken.updateMany({
        where: { userId, purpose, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.authToken.create({
        data: {
          userId,
          purpose,
          payload,
          hash: hash(token),
          expiresAt: new Date(Date.now() + (purpose === 'reset' ? 30 * 60000 : 86400000)),
        },
      });
      await tx.outbox.create({
        data: {
          kind: 'email',
          payload: {
            to: address,
            subject:
              purpose === 'reset' ? 'Восстановление пароля CarHistory' : 'Подтверждение email CarHistory',
            text: `Откройте ссылку: ${process.env.FRONTEND_URL}/${routes[purpose]}?token=${token}`,
          },
        },
      });
    });
  }
  async rotate(token: string | undefined, req: Request, res: Response) {
    if (!token) fail(401, 'AUTH_REQUIRED', 'Войдите в аккаунт');
    const next = randomToken();
    const result = await this.db.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        any[]
      >`SELECT id FROM "RefreshToken" WHERE hash=${hash(token!)} FOR UPDATE`;
      if (!rows.length) return null;
      const old = await tx.refreshToken.findUniqueOrThrow({
        where: { id: rows[0].id },
        include: { session: { include: { user: true } } },
      });
      if (old.usedAt) {
        await tx.session.update({ where: { id: old.sessionId }, data: { revokedAt: new Date() } });
        return null;
      }
      if (old.expiresAt < new Date() || old.session.revokedAt || old.session.expiresAt < new Date())
        return null;
      await tx.refreshToken.update({ where: { id: old.id }, data: { usedAt: new Date() } });
      await tx.refreshToken.create({
        data: { sessionId: old.sessionId, hash: hash(next), expiresAt: old.session.expiresAt },
      });
      await tx.session.update({ where: { id: old.sessionId }, data: { lastSeenAt: new Date() } });
      return old.session;
    });
    if (!result) {
      res.clearCookie('ch_refresh', cookieOptions());
      fail(401, 'AUTH_REQUIRED', 'Сессия завершена. Войдите снова');
    }
    res.cookie('ch_refresh', next, { ...cookieOptions(), maxAge: result.expiresAt.getTime() - Date.now() });
    return { accessToken: await this.access(result.userId, result.id), user: userDto(result.user) };
  }
}
@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) readonly reflector: Reflector,
    @Inject(AuthService) readonly auth: AuthService,
  ) {}
  async canActivate(ctx: ExecutionContext) {
    if (this.reflector.getAllAndOverride('public', [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest();
    const token = req.headers.authorization?.replace(/^Bearer /, '');
    if (!token) fail(401, 'AUTH_REQUIRED', 'Войдите в аккаунт');
    let payload: any;
    try {
      payload = await this.auth.jwt.verifyAsync(token, {
        secret: process.env.JWT_ACCESS_SECRET,
        issuer: process.env.JWT_ISSUER,
        audience: process.env.JWT_AUDIENCE,
      });
    } catch {
      fail(401, 'AUTH_REQUIRED', 'Сессия истекла');
    }
    const session = await this.auth.db.session.findFirst({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    if (!session) fail(401, 'AUTH_REQUIRED', 'Сессия завершена');
    req.actor = { id: payload.sub, sid: payload.sid, requestId: req.requestId };
    return true;
  }
}
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) readonly auth: AuthService) {}
  @Public() @Post('register') async register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = registerSchema.parse(body);
    const user = await this.auth.db.user.create({
      data: {
        email: input.email,
        firstName: input.firstName,
        passwordHash: await argonHash(input.password, options),
      },
    });
    await this.auth.issueEmail(user.id, user.email, 'verify');
    return this.auth.session(user, req, res);
  }
  @Public() @Post('login') async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const input = loginSchema.parse(body);
    const user = await this.auth.db.user.findUnique({ where: { email: input.email } });
    const digest = user?.passwordHash ?? (await argonHash('timing-placeholder-password', options));
    if (!(await verify(digest, input.password)) || !user)
      fail(401, 'INVALID_CREDENTIALS', 'Неверный email или пароль');
    return this.auth.session(user, req, res);
  }
  @Public() @Post('refresh') refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.rotate(req.cookies.ch_refresh, req, res);
  }
  @Public() @Post('logout') async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (req.cookies.ch_refresh) {
      const t = await this.auth.db.refreshToken.findUnique({ where: { hash: hash(req.cookies.ch_refresh) } });
      if (t)
        await this.auth.db.session.update({ where: { id: t.sessionId }, data: { revokedAt: new Date() } });
    }
    res.clearCookie('ch_refresh', cookieOptions());
    return { ok: true };
  }
  @Get('me') async me(@Req() req: any) {
    return userDto(await this.auth.db.user.findUniqueOrThrow({ where: { id: req.actor.id } }));
  }
  @Public() @Post('forgot-password') async forgot(@Body() body: unknown) {
    const { email: address } = z.object({ email }).strict().parse(body);
    const user = await this.auth.db.user.findUnique({ where: { email: address } });
    if (user) await this.auth.issueEmail(user.id, address, 'reset');
    return { message: 'Если аккаунт существует, письмо с инструкцией будет отправлено' };
  }
  @Public() @Post('reset-password') async reset(@Body() body: unknown) {
    const input = z
      .object({ token: z.string().min(20).max(200), password })
      .strict()
      .parse(body);
    const passwordHash = await argonHash(input.password, options);
    await this.auth.db.$transaction(async (tx) => {
      const t = await tx.authToken.findUnique({ where: { hash: hash(input.token) } });
      if (!t || t.purpose !== 'reset' || t.usedAt || t.expiresAt < new Date())
        fail(400, 'TOKEN_INVALID', 'Ссылка недействительна или истекла');
      const won = await tx.authToken.updateMany({
        where: { id: t.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!won.count) fail(400, 'TOKEN_INVALID', 'Ссылка уже использована');
      await tx.user.update({ where: { id: t.userId }, data: { passwordHash } });
      await tx.authToken.updateMany({
        where: { userId: t.userId, purpose: 'reset', usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.session.updateMany({ where: { userId: t.userId }, data: { revokedAt: new Date() } });
    });
    return { ok: true };
  }
  @Public() @Post('verify-email') async verifyEmail(@Body() body: unknown) {
    const { token } = z
      .object({ token: z.string().max(200) })
      .strict()
      .parse(body);
    await this.auth.db.$transaction(async (tx) => {
      const t = await tx.authToken.findUnique({ where: { hash: hash(token) } });
      if (!t || !['verify', 'email'].includes(t.purpose) || t.usedAt || t.expiresAt < new Date())
        fail(400, 'TOKEN_INVALID', 'Ссылка недействительна или истекла');
      const won = await tx.authToken.updateMany({
        where: { id: t.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (!won.count) fail(400, 'TOKEN_INVALID', 'Ссылка уже использована');
      await tx.user.update({
        where: { id: t.userId },
        data: {
          emailVerifiedAt: new Date(),
          ...(t.purpose === 'email' && t.payload ? { email: t.payload } : {}),
        },
      });
    });
    return { ok: true };
  }
  @Post('resend-verification') async resend(@Req() req: any) {
    const u = await this.auth.db.user.findUniqueOrThrow({ where: { id: req.actor.id } });
    if (!u.emailVerifiedAt) await this.auth.issueEmail(u.id, u.email, 'verify');
    return { ok: true };
  }
}
@Controller()
export class AccountController {
  constructor(@Inject(AuthService) readonly auth: AuthService) {}
  @Get('profile') async profile(@Req() req: any) {
    return userDto(await this.auth.db.user.findUniqueOrThrow({ where: { id: req.actor.id } }));
  }
  @Patch('profile') async update(@Req() req: any, @Body() body: unknown) {
    const data = z
      .object({
        firstName: z.string().trim().min(1).max(80),
        currency,
        timezone: z.string().refine((v) => {
          try {
            new Intl.DateTimeFormat('en', { timeZone: v });
            return true;
          } catch {
            return false;
          }
        }, 'Неизвестный часовой пояс'),
        emailNotifications: z.boolean(),
        email: email.optional(),
      })
      .strict()
      .parse(body);
    const { email: address, ...fields } = data;
    const u = await this.auth.db.user.update({ where: { id: req.actor.id }, data: fields });
    if (address && address !== u.email) await this.auth.issueEmail(u.id, address, 'email', address);
    return userDto(u);
  }
  @Post('profile/change-password') async changePassword(@Req() req: any, @Body() body: unknown) {
    const data = z.object({ currentPassword: z.string(), password }).strict().parse(body);
    const u = await this.auth.db.user.findUniqueOrThrow({ where: { id: req.actor.id } });
    if (!(await verify(u.passwordHash, data.currentPassword)))
      fail(400, 'INVALID_PASSWORD', 'Неверный текущий пароль');
    const passwordHash = await argonHash(data.password, options);
    await this.auth.db.$transaction([
      this.auth.db.user.update({ where: { id: u.id }, data: { passwordHash } }),
      this.auth.db.session.updateMany({ where: { userId: u.id }, data: { revokedAt: new Date() } }),
      this.auth.db.authToken.updateMany({
        where: { userId: u.id, purpose: 'reset' },
        data: { usedAt: new Date() },
      }),
    ]);
    return { ok: true };
  }
  @Get('sessions') async sessions(@Req() req: any) {
    const s = await this.auth.db.session.findMany({
      where: { userId: req.actor.id, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastSeenAt: 'desc' },
    });
    return {
      items: s.map((v) => ({
        id: v.id,
        userAgent: v.userAgent,
        createdAt: v.createdAt,
        lastSeenAt: v.lastSeenAt,
        current: v.id === req.actor.sid,
      })),
    };
  }
  @Delete('sessions') async revokeAll(@Req() req: any) {
    await this.auth.db.session.updateMany({
      where: { userId: req.actor.id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
  @Delete('sessions/:id') async revoke(@Req() req: any) {
    await this.auth.db.session.updateMany({
      where: { id: uuid(req.params.id), userId: req.actor.id },
      data: { revokedAt: new Date() },
    });
    return { ok: true };
  }
}
