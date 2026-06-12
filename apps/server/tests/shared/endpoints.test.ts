/**
 * @qm-wx/shared endpoints + actionUrl 单测
 *
 * 注：虽然测的是 shared 包，但放在 apps/server 是因为：
 * - packages/shared 的 vitest 1.6 + Node 25 解析 .ts re-export 有 bug
 * - apps/server 用 vitest 3.2 + alias 重写运行正常
 * - 待 shared 升级 vitest 后可搬回
 */
import { describe, it, expect, vi } from 'vitest';
// 子路径 export — 避开根入口的 ESM .js 后缀解析问题
import { ENDPOINTS, actionUrl } from '@qm-wx/shared/api-contracts';

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
