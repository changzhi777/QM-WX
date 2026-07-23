/**
 * infra/crypto.ts — token 加密工具（AES-256-GCM）
 *
 * 用途：存第三方 OAuth token（如 Garmin OAuth 1.0a access token + secret）到 DeviceBinding.accessTokenEnc。
 * 复用 wxpay AES-256-GCM 解密范式（wxpay.service.ts:208），抽通用 encrypt/decrypt。
 *
 * 格式：iv(12B base64) : authTag(16B base64) : ciphertext(base64)
 * env：CRYPTO_KEY（32 字节，hex 64 字符 或 base64）；未配则从 JWT_SECRET 派生（开发兜底，生产必配 CRYPTO_KEY）
 *
 * V0.2.89 新增（Phase 1A，配合 garmin-health.ts OAuth 1.0a token 落库）
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';

/** 取 32 字节密钥（CRYPTO_KEY 优先，否则 JWT_SECRET 派生） */
function getKey(): Buffer {
  const raw = env.CRYPTO_KEY || env.JWT_SECRET;
  if (!raw) return crypto.scryptSync('qm-dev-fallback', 'qm-salt', 32); // 开发兜底
  // hex 64 字符 → 直接
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  const buf = Buffer.from(raw);
  return buf.length === 32 ? buf : crypto.scryptSync(buf, 'qm-salt', 32);
}

/** 加密：返 iv:tag:ciphertext（base64 段拼） */
export function encryptToken(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), enc.toString('base64')].join(':');
}

/** 解密：iv:tag:ciphertext → plain（格式错或篡改抛错，GCM 完整性校验） */
export function decryptToken(encStr: string): string {
  const parts = encStr.split(':');
  if (parts.length !== 3) throw new Error('invalid token format (expected iv:tag:ciphertext)');
  const [ivB64, tagB64, encB64] = parts;
  const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(encB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}
