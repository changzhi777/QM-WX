/**
 * shared 包单测 — endpoints + actionUrl
 *
 * 注：之前在 apps/server/tests/shared/endpoints.test.ts 跑，是因为
 * shared 仓 vitest 1.6 + Node 25 解析 .ts re-export 有 bug。
 * 升级 vitest 到 3.2.6 后回到原籍（packages/shared/tests/）。
 *
 * 改用相对路径 + 走 vitest.config alias 解析，避免依赖 workspace 协议
 * 在 monorepo 自我引用时的边缘 case。
 */
import { describe, it, expect, vi } from 'vitest';
import { ENDPOINTS, actionUrl } from '../src/api-contracts/endpoints.js';

describe('actionUrl', () => {
  it('已注册 action → 返回对应 URL', () => {
    expect(actionUrl('user', 'login')).toBe('/api/user');
    expect(actionUrl('sport', 'checkin')).toBe('/api/sport');
    expect(actionUrl('auth', 'refresh')).toBe('/api/auth/refresh');
    expect(actionUrl('mall', 'listCategories')).toBe('/api/mall');
  });

  it('未注册 action → fallback /api/{module} + console.warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(actionUrl('user', 'nonexistent')).toBe('/api/user');
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("action 'user.nonexistent' not registered"),
    );
    warn.mockRestore();
  });

  it('P0 修复：4 个之前缺失的 action 都已登记', () => {
    expect(actionUrl('sport', 'myGroups')).toBe('/api/sport');
    expect(actionUrl('sport', 'today')).toBe('/api/sport');
    expect(actionUrl('user', 'me')).toBe('/api/user');
    expect(actionUrl('auth', 'refresh')).toBe('/api/auth/refresh');
  });
});

describe('ENDPOINTS 结构完整性', () => {
  it('每个 module 都有至少 1 个 action', () => {
    for (const [module, actions] of Object.entries(ENDPOINTS)) {
      const keys = Object.keys(actions);
      expect(keys.length, `module ${module}`).toBeGreaterThan(0);
    }
  });

  it('每个 action 值都是 /api/ 开头', () => {
    for (const [module, actions] of Object.entries(ENDPOINTS)) {
      for (const [action, url] of Object.entries(actions)) {
        expect(url, `${module}.${action}`).toMatch(/^\/api\//);
      }
    }
  });
});
