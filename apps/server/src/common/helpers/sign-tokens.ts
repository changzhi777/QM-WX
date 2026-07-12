/**
 * 签发 access + refresh JWT（V0.1.129，user.service.login + auth.service.loginByMethod 复用）
 *
 * access 2h + refresh 30d（轮换 jti），payload 含 sub/id/openid
 */
import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'node:crypto';

export async function signTokens(
  app: FastifyInstance,
  user: { id: string; openid: string },
): Promise<{ accessToken: string; refreshToken: string }> {
  const accessToken = await app.jwt.sign(
    { sub: user.id, id: user.id, openid: user.openid },
    { expiresIn: '2h' },
  );
  const refreshToken = await app.jwt.sign(
    { sub: user.id, id: user.id, openid: user.openid, kind: 'refresh', jti: randomUUID() },
    { expiresIn: '30d' },
  );
  return { accessToken, refreshToken };
}
