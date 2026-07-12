/**
 * 邮箱密码登录 connector（V0.1.129）
 *
 * email + password → bcrypt verify → User
 * 用于 H5/App/未来多端（小程序用户主体仍走微信）
 */
import bcrypt from 'bcrypt';
import { prisma } from '../../../infra/prisma.js';

export async function verifyEmailPassword(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}
