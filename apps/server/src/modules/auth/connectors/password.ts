/**
 * admin Web 账号密码 connector（V0.1.129）
 *
 * username + password → bcrypt verify → User
 * admin 鉴权另走 AppConfig.admin_whitelist（openid 白名单，adminService.isAdmin）
 */
import bcrypt from 'bcrypt';
import { prisma } from '../../../infra/prisma.js';

export async function verifyAdminPassword(username: string, password: string) {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user?.passwordHash) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}
