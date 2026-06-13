/**
 * Redis 缓存抽象层单测
 *
 * 覆盖：
 * - get 命中 / 未命中 / 解析失败（fail-open）
 * - set 写入 TTL
 * - del 单个 + delByPattern 批量
 * - wrap cache-aside 模式
 * - 静默失败（不抛错）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedis = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  scan: vi.fn(),
}));

vi.mock('../../src/infra/redis.js', () => ({ redis: mockRedis }));

import { Cache } from '../../src/infra/cache.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('Cache.get', () => {
  it('命中：JSON 反序列化后返回', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ foo: 1 }));
    const result = await Cache.get<{ foo: number }>({ key: 'test:1' });
    expect(result).toEqual({ foo: 1 });
    expect(mockRedis.get).toHaveBeenCalledWith('qmwx:cache:test:1');
  });

  it('未命中：返 null', async () => {
    mockRedis.get.mockResolvedValue(null);
    const result = await Cache.get({ key: 'test:none' });
    expect(result).toBeNull();
  });

  it('JSON 解析失败：返 null（fail-open）', async () => {
    mockRedis.get.mockResolvedValue('not-valid-json{');
    const result = await Cache.get({ key: 'test:bad' });
    expect(result).toBeNull();
  });

  it('Redis 抛错：返 null（不抛）', async () => {
    mockRedis.get.mockRejectedValue(new Error('connection lost'));
    const result = await Cache.get({ key: 'test:err' });
    expect(result).toBeNull();
  });
});

describe('Cache.set', () => {
  it('JSON 序列化 + TTL', async () => {
    await Cache.set({ key: 'test:set', ttlSec: 60, value: { a: 1, b: 'x' } });
    expect(mockRedis.set).toHaveBeenCalledWith(
      'qmwx:cache:test:set',
      JSON.stringify({ a: 1, b: 'x' }),
      'EX',
      60,
    );
  });

  it('Redis 抛错：静默', async () => {
    mockRedis.set.mockRejectedValue(new Error('write fail'));
    await expect(
      Cache.set({ key: 'x', ttlSec: 1, value: 1 }),
    ).resolves.toBeUndefined();
  });
});

describe('Cache.del', () => {
  it('删单个 key', async () => {
    await Cache.del('foo:bar');
    expect(mockRedis.del).toHaveBeenCalledWith('qmwx:cache:foo:bar');
  });
});

describe('Cache.delByPattern', () => {
  it('用 SCAN 批量删，返回删除数', async () => {
    // 第 1 次 SCAN 返 '5' + 2 keys；第 2 次 SCAN 返 '0' + 1 key；退出
    mockRedis.scan
      .mockResolvedValueOnce(['5', ['qmwx:cache:feat:1', 'qmwx:cache:feat:2']])
      .mockResolvedValueOnce(['0', ['qmwx:cache:feat:3']])
      .mockResolvedValueOnce(['0', []]); // 防 do-while 二次执行（已不会，但保险）
    const deleted = await Cache.delByPattern('feat:*');
    expect(deleted).toBe(3);
    expect(mockRedis.scan).toHaveBeenCalledWith('0', 'MATCH', 'qmwx:cache:feat:*', 'COUNT', 100);
  });

  it('SCAN 一次返完（cursor=0）', async () => {
    mockRedis.scan.mockReset();
    mockRedis.scan.mockResolvedValueOnce(['0', ['qmwx:cache:foo:1']]);
    mockRedis.scan.mockResolvedValueOnce(['0', []]);
    const deleted = await Cache.delByPattern('foo:*');
    expect(deleted).toBe(1);
  });

  it('无匹配 key：返 0', async () => {
    mockRedis.scan.mockReset();
    mockRedis.scan.mockResolvedValueOnce(['0', []]);
    mockRedis.scan.mockResolvedValueOnce(['0', []]);
    const deleted = await Cache.delByPattern('nothing:*');
    expect(deleted).toBe(0);
  });

  it('SCAN 抛错：返 0（不抛）', async () => {
    mockRedis.scan.mockReset();
    mockRedis.scan.mockRejectedValue(new Error('scan fail'));
    const deleted = await Cache.delByPattern('any:*');
    expect(deleted).toBe(0);
  });
});

describe('Cache.wrap (cache-aside)', () => {
  it('命中：不调 loader，直接返缓存值', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ x: 'cached' }));
    const loader = vi.fn().mockResolvedValue({ x: 'fresh' });
    const result = await Cache.wrap('w:1', 60, loader);
    expect(result).toEqual({ x: 'cached' });
    expect(loader).not.toHaveBeenCalled();
    // 命中时不应该 set
    expect(mockRedis.set).not.toHaveBeenCalled();
  });

  it('未命中：调 loader + 回填缓存', async () => {
    mockRedis.get.mockResolvedValue(null);
    const loader = vi.fn().mockResolvedValue({ x: 'fresh' });
    const result = await Cache.wrap('w:2', 60, loader);
    expect(result).toEqual({ x: 'fresh' });
    expect(loader).toHaveBeenCalledTimes(1);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'qmwx:cache:w:2',
      JSON.stringify({ x: 'fresh' }),
      'EX',
      60,
    );
  });

  it('loader 抛错：透传（不静默）', async () => {
    mockRedis.get.mockResolvedValue(null);
    const loader = vi.fn().mockRejectedValue(new Error('db down'));
    await expect(Cache.wrap('w:3', 60, loader)).rejects.toThrow(/db down/);
    // loader 失败时不应回填（避免缓存错误数据）
    expect(mockRedis.set).not.toHaveBeenCalled();
  });
});
