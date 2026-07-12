/**
 * auth.service login dispatch 单测（V0.1.129，4 method）
 *
 * mock connectors + userService + configRepo，验证 dispatch 路由 + JWT 签发
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('src/infra/redis.js', () => ({
  redis: { get: vi.fn(), set: vi.fn(), del: vi.fn(), scan: vi.fn() },
}));
vi.mock('src/infra/prisma.js', () => ({ prisma: { user: { findUnique: vi.fn() } } }));
vi.mock('src/config/env.js', () => ({ env: { NODE_ENV: 'test' } }));
vi.mock('src/modules/user/user.service.js', () => ({
  userService: { login: vi.fn() },
  toUserOutput: vi.fn((u: unknown) => u),
}));
vi.mock('src/modules/app-config/app-config.repository.js', () => ({
  configRepo: { getLoginConfig: vi.fn().mockResolvedValue({}) },
}));
vi.mock('src/modules/auth/connectors/phone.js', () => ({ verifyPhone: vi.fn() }));
vi.mock('src/modules/auth/connectors/email.js', () => ({ verifyEmailPassword: vi.fn() }));
vi.mock('src/modules/auth/connectors/password.js', () => ({ verifyAdminPassword: vi.fn() }));

import { authService } from 'src/modules/auth/auth.service.js';
import { userService } from 'src/modules/user/user.service.js';
import { verifyPhone } from 'src/modules/auth/connectors/phone.js';
import { verifyEmailPassword } from 'src/modules/auth/connectors/email.js';
import { verifyAdminPassword } from 'src/modules/auth/connectors/password.js';

const fakeApp = { jwt: { sign: vi.fn().mockResolvedValue('tok') } } as unknown as FastifyInstance;

beforeEach(() => vi.clearAllMocks());

describe('authService.login dispatch (V0.1.129)', () => {
  it('wechat → 委托 userService.login', async () => {
    vi.mocked(userService.login).mockResolvedValue({ user: { id: 'u1' } } as never);
    await authService.login(fakeApp, { method: 'wechat', payload: { code: 'c' } });
    expect(userService.login).toHaveBeenCalledWith(fakeApp, { code: 'c' });
  });

  it('phone 成功 → 签 JWT', async () => {
    vi.mocked(verifyPhone).mockResolvedValue({ id: 'u1', openid: 'ox' } as never);
    const r = await authService.login(fakeApp, {
      method: 'phone',
      payload: { phone: '13800138000', code: '123' },
    });
    expect(r.accessToken).toBe('tok');
  });

  it('phone 未注册 → unauthorized', async () => {
    vi.mocked(verifyPhone).mockResolvedValue(null);
    await expect(
      authService.login(fakeApp, { method: 'phone', payload: {} }),
    ).rejects.toThrow();
  });

  it('email 成功 → 签 JWT', async () => {
    vi.mocked(verifyEmailPassword).mockResolvedValue({ id: 'u2', openid: 'ox2' } as never);
    const r = await authService.login(fakeApp, {
      method: 'email',
      payload: { email: 'a@b.com', password: 'p' },
    });
    expect(r.user.id).toBe('u2');
  });

  it('password 成功 → 签 JWT', async () => {
    vi.mocked(verifyAdminPassword).mockResolvedValue({ id: 'u3', openid: 'ox3' } as never);
    const r = await authService.login(fakeApp, {
      method: 'password',
      payload: { username: 'admin', password: 'p' },
    });
    expect(r.user.id).toBe('u3');
  });

  it('password 账号或密码错 → unauthorized', async () => {
    vi.mocked(verifyAdminPassword).mockResolvedValue(null);
    await expect(
      authService.login(fakeApp, { method: 'password', payload: {} }),
    ).rejects.toThrow();
  });
});
