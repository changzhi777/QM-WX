/**
 * auth module — refresh token
 *
 * POST /api/auth/refresh
 * body: { refreshToken: string }
 * 验签成功 → 签发新 access + 轮换 refresh
 */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { userRepo } from '../user/user.repository.js';
import { Errors } from '../../common/errors.js';

const RefreshInputSchema = z.object({
  refreshToken: z.string().min(1),
});

export async function authRoutes(app: FastifyInstance) {
  app.post(
    '/refresh',
    {
      schema: {
        body: RefreshInputSchema,
      },
      config: { public: true },
    },
    async (req) => {
      const { refreshToken } = req.body as z.infer<typeof RefreshInputSchema>;

      let decoded: { sub: string; openid: string; kind?: string };
      try {
        decoded = app.jwt.verify<typeof decoded>(refreshToken);
      } catch {
        throw Errors.unauthorized('refresh token invalid or expired');
      }

      if (decoded.kind !== 'refresh') {
        throw Errors.unauthorized('not a refresh token');
      }

      // 用户仍存在
      const user = await userRepo.findById(decoded.sub);
      if (!user) throw Errors.unauthorized('user not found');

      // 签新 token（refresh 轮换：旧的也算失效，靠前端不重发即可）
      const newAccess = await app.jwt.sign(
        { sub: user.id, openid: user.openid },
        { expiresIn: '2h' },
      );
      const newRefresh = await app.jwt.sign(
        { sub: user.id, openid: user.openid, kind: 'refresh' },
        { expiresIn: '30d' },
      );

      return { code: 0, data: { accessToken: newAccess, refreshToken: newRefresh } };
    },
  );
}
