/**
 * auth module — refresh token
 *
 * POST /api/auth/refresh
 * body: { refreshToken: string }
 * 验签成功 → 签发新 access + 轮换 refresh
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { userRepo } from '../user/user.repository.js';
import { Errors } from '../../common/errors.js';
import { redis } from '../../infra/redis.js';
import { authService } from './auth.service.js';
import { issueSmsCode } from './sms-code.js';
import { sendSms } from './connectors/sms.js';
import { sendMail } from './connectors/mail.js';

const RefreshInputSchema = z.object({
  refreshToken: z.string().min(1),
});

/** V0.1.129 统一登录（method + payload，public）*/
const LoginSchema = z.object({
  method: z.enum(['wechat', 'phone', 'email', 'password']),
  payload: z.record(z.unknown()),
});

/** V0.1.129 发送短信验证码（public，限流由 rate-limit 插件兜底）*/
const SendSmsSchema = z.object({
  phone: z.string().regex(/^1[3-9]\d{9}$/, 'invalid phone'),
});

/** V0.1.129 发送邮件（public，预留）*/
const SendMailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  html: z.string().min(1),
});

/** 已消费的 refresh token 黑名单 key（一次性轮换：用过即拉黑，防泄露重放） */
const usedRefreshKey = (jti: string) => `auth:refresh:used:${jti}`;

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/refresh',
    {
      config: { public: true },
    },
    async (req) => {
      // service 层 parse（fastify 4 不直接接 zod schema，service 自己做校验）
      let body: z.infer<typeof RefreshInputSchema>;
      try {
        body = RefreshInputSchema.parse(req.body);
      } catch (e) {
        const issue = (e as z.ZodError).issues[0];
        throw Errors.badRequest(`${issue.path.join('.')}: ${issue.message}`);
      }
      const { refreshToken } = body;

      let decoded: { sub: string; openid: string; kind?: string; jti?: string; exp?: number };
      try {
        decoded = app.jwt.verify<typeof decoded>(refreshToken);
      } catch {
        throw Errors.unauthorized('refresh token invalid or expired');
      }

      if (decoded.kind !== 'refresh') {
        throw Errors.unauthorized('not a refresh token');
      }

      // 一次性轮换 + 复用检测：同一个 refresh token 用过即拉黑。
      // 若被重复使用（疑似泄露/重放）→ 拒绝，迫使用户重新登录。
      if (decoded.jti) {
        const used = await redis.exists(usedRefreshKey(decoded.jti));
        if (used) {
          throw Errors.unauthorized('refresh token already used');
        }
        // 拉黑当前 token，TTL = 剩余有效期（过期后自动清理，不占内存）
        const nowSec = Math.floor(Date.now() / 1000);
        const ttl = decoded.exp ? decoded.exp - nowSec : 30 * 24 * 3600;
        if (ttl > 0) await redis.setex(usedRefreshKey(decoded.jti), ttl, '1');
      }

      // 用户仍存在
      const user = await userRepo.findById(decoded.sub);
      if (!user) throw Errors.unauthorized('user not found');

      // 签新 token（refresh 轮换：新 refresh 带新 jti，旧的已被拉黑）
      const newAccess = await app.jwt.sign(
        { sub: user.id, id: user.id, openid: user.openid },
        { expiresIn: '2h' },
      );
      const newRefresh = await app.jwt.sign(
        { sub: user.id, id: user.id, openid: user.openid, kind: 'refresh', jti: randomUUID() },
        { expiresIn: '30d' },
      );

      return { code: 0, data: { accessToken: newAccess, refreshToken: newRefresh } };
    },
  );

  // V0.1.129 统一登录入口（public，dispatch by method）
  app.post(
    '/login',
    { config: { public: true } },
    async (req) => {
      const input = LoginSchema.parse((req.body as { payload?: unknown }).payload ?? {});
      const data = await authService.login(app, input);
      return { code: 0, data };
    },
  );

  // V0.1.129 发送短信验证码（public）
  app.post(
    '/send-sms',
    { config: { public: true } },
    async (req) => {
      const { phone } = SendSmsSchema.parse((req.body as { payload?: unknown }).payload ?? {});
      const code = await issueSmsCode(phone);
      const result = await sendSms(phone, code);
      // dev stub 返 devCode 方便联调；生产不泄露
      return { code: 0, data: { ok: result.ok, devCode: result.devCode } };
    },
  );

  // V0.1.129 发送邮件（public，预留）
  app.post(
    '/send-mail',
    { config: { public: true } },
    async (req) => {
      const { to, subject, html } = SendMailSchema.parse(
        (req.body as { payload?: unknown }).payload ?? {},
      );
      const result = await sendMail(to, subject, html);
      return { code: 0, data: result };
    },
  );
}
