/**
 * 手机号验证码登录 connector（V0.1.129）
 *
 * phone + smsCode → Redis 校验 → 查 User by phone
 * 返 null（未注册）时调用方决定是否注册
 */
import { prisma } from '../../../infra/prisma.js';
import { verifySmsCode } from '../sms-code.js';

export async function verifyPhone(phone: string, code: string) {
  const ok = await verifySmsCode(phone, code);
  if (!ok) return null;
  return prisma.user.findUnique({ where: { phone } });
}
