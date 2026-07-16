/**
 * scripts/dev-cli/__tests__/platform.test.ts — 路径探针单测（V0.2.10）
 * 跑测试：cd 项目根 → pnpm exec vitest run scripts/dev-cli/
 *
 * 注意：mock `node:fs` 的 existsSync 来控制探测命中/缺失，不依赖本机实际安装
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs';

vi.mock('node:fs', async () => {
  const actual = await vi.importActual<typeof fs>('node:fs');
  return { ...actual, existsSync: vi.fn() };
});

import { getCliPath, listCandidates, isCliAvailable, BinNotFoundError } from '../platform.js';

describe('platform — 路径探针', () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReset();
  });

  it('darwin 命中第一候选', () => {
    // 模拟 process.platform = darwin（默认就是）
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
      String(p).includes('wechatwebdevtools.app'),
    );
    const p = getCliPath();
    expect(p).toMatch(/wechatwebdevtools\.app.*cli$/);
  });

  it('darwin 第 1 候选不存在时 fallback 第 2', () => {
    vi.mocked(fs.existsSync).mockImplementation((p: fs.PathLike) =>
      String(p).includes('微信开发者工具.app'),
    );
    const p = getCliPath();
    expect(p).toMatch(/微信开发者工具\.app.*cli$/);
  });

  it('全部候选不存在抛 BinNotFoundError（darwin）', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => getCliPath()).toThrow(BinNotFoundError);
    try {
      getCliPath();
    } catch (e) {
      const err = e as BinNotFoundError;
      expect(err.name).toBe('BinNotFoundError');
      expect(err.platform).toBe(process.platform);
      expect(err.attempted.length).toBeGreaterThan(0);
      expect(err.message).toContain('未找到微信开发者工具 CLI');
    }
  });

  it('isCliAvailable = true 当存在', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    expect(isCliAvailable()).toBe(true);
  });

  it('isCliAvailable = false 当不存在', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(isCliAvailable()).toBe(false);
  });

  it('listCandidates 返当前平台候选', () => {
    const cands = listCandidates();
    expect(cands.length).toBeGreaterThan(0);
    // darwin 应至少包含 wechatwebdevtools.app
    if (process.platform === 'darwin') {
      expect(cands.some((c) => c.includes('wechatwebdevtools.app'))).toBe(true);
    }
  });
});
