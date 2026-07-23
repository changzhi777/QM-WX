/**
 * tests/infra/crypto.test.ts — token 加密工具单测（V0.2.89）
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/config/env.js', () => ({
  env: {
    CRYPTO_KEY: 'a'.repeat(64), // hex 64 字符 → 32 字节密钥
    JWT_SECRET: 'jwt-secret-fallback',
  },
}));

import { encryptToken, decryptToken } from '../../src/infra/crypto.js';

describe('infra/crypto (V0.2.89 AES-256-GCM)', () => {
  it('encrypt/decrypt 往返一致', () => {
    const plain = 'garmin-oauth-token-secret-abc123';
    const enc = encryptToken(plain);
    expect(enc).not.toBe(plain);
    expect(enc.split(':').length).toBe(3); // iv:tag:ciphertext
    expect(decryptToken(enc)).toBe(plain);
  });

  it('每次加密 iv 随机（同 plain 两次密文不同）', () => {
    expect(encryptToken('same')).not.toBe(encryptToken('same'));
  });

  it('篡改密文 → GCM 完整性校验抛错', () => {
    const enc = encryptToken('secret');
    const [iv, tag, data] = enc.split(':');
    const tampered = `${iv}:${tag}:${data.slice(0, -2)}AA`;
    expect(() => decryptToken(tampered)).toThrow();
  });

  it('格式错（非 iv:tag:ciphertext）抛错', () => {
    expect(() => decryptToken('bad-format')).toThrow(/invalid token format/);
    expect(() => decryptToken('a:b')).toThrow(/invalid token format/);
  });
});
