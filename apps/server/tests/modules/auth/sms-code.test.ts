/**
 * sms-code 单测（V0.1.129，Redis 验证码存取）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const store = new Map<string, string>();
vi.mock('src/infra/redis.js', () => ({
  redis: {
    set: vi.fn(async (k: string, v: string) => {
      store.set(k, v);
      return 'OK';
    }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
  },
}));

import { issueSmsCode, verifySmsCode } from 'src/modules/auth/sms-code.js';

beforeEach(() => store.clear());

describe('sms-code (V0.1.129)', () => {
  it('issue 返 6 位数字 + 存 Redis', async () => {
    const code = await issueSmsCode('13800138000');
    expect(code).toMatch(/^\d{6}$/);
    expect(store.get('auth:sms:13800138000')).toBe(code);
  });

  it('verify 正确码 → true + 一次性删除', async () => {
    const code = await issueSmsCode('13800138001');
    expect(await verifySmsCode('13800138001', code)).toBe(true);
    // 一次性：再 verify 同码 → false（已删）
    expect(await verifySmsCode('13800138001', code)).toBe(false);
  });

  it('verify 错误码 → false', async () => {
    await issueSmsCode('13800138002');
    expect(await verifySmsCode('13800138002', '000000')).toBe(false);
  });

  it('verify 未发送 → false', async () => {
    expect(await verifySmsCode('13900000000', '123456')).toBe(false);
  });
});
