/**
 * 短信验证码存取（V0.1.129，Redis）
 *
 * issue: 生成 6 位码 + 存 Redis（key=auth:sms:{phone}，TTL 5min）
 * verify: 校验码 + 删除（一次性，防重放）
 */
import { randomInt } from 'node:crypto';
import { redis } from '../../infra/redis.js';

const SMS_KEY = (phone: string) => `auth:sms:${phone}`;
const TTL_SEC = 300; // 5 分钟

/** 生成 6 位验证码 + 存 Redis，返回码 */
export async function issueSmsCode(phone: string): Promise<string> {
  const code = String(randomInt(100000, 999999));
  await redis.set(SMS_KEY(phone), code, 'EX', TTL_SEC);
  return code;
}

/** 校验验证码（成功删除一次性；返回是否匹配） */
export async function verifySmsCode(phone: string, code: string): Promise<boolean> {
  const stored = await redis.get(SMS_KEY(phone));
  if (!stored || stored !== code) return false;
  await redis.del(SMS_KEY(phone));
  return true;
}
