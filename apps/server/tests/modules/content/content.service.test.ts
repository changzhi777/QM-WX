/**
 * content.service 单元测试
 *
 * 覆盖：
 * - list: type 过滤 + 分页 + Decimal 序列化（V0.1.10 增 Cache.wrap 行为）
 * - detail: 不存在 / 已下架 → notFound（不缓存）；正常 → 序列化 + 回填
 * - enroll: 3 分支（none / 重复 / 正常）
 * - invalidateContentsCache / invalidateContentDetail: 写后失效
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('src/infra/prisma.js', () => {
  return {
    prisma: {
      content: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      enrollment: {
        findFirst: vi.fn(),
        create: vi.fn(),
      },
    },
  };
});

import { prisma } from 'src/infra/prisma.js';
import {
  contentService,
  invalidateContentsCache,
  invalidateContentDetail,
} from 'src/modules/content/content.service.js';

const mockedPrisma = vi.mocked(prisma);

// V0.1.10: Mock Redis — Cache.wrap / delByPattern 需要
// 标准 mock 模式（vi.hoisted + beforeEach 重新 mockImplementation，clearAll 不清实现）
const _redisMockState = vi.hoisted(() => {
  const cacheStore = new Map<string, string>();
  return {
    cacheStore,
    redis: {
      get: vi.fn(),
      set: vi.fn(),
      del: vi.fn(),
      scan: vi.fn(),
    },
  };
});

vi.mock('src/infra/redis.js', () => ({
  redis: _redisMockState.redis,
}));

function setupMockRedis() {
  const { cacheStore, redis } = _redisMockState;
  redis.get.mockImplementation(async (k: string) => cacheStore.get(k) ?? null);
  redis.set.mockImplementation(async (k: string, v: string) => {
    cacheStore.set(k, v);
    return 'OK';
  });
  redis.del.mockImplementation(async (k: string) => {
    const had = cacheStore.has(k);
    cacheStore.delete(k);
    return had ? 1 : 0;
  });
  // SCAN MATCH 模拟：Cache.delByPattern 调 scan(cursor, 'MATCH', PREFIX+pattern, 'COUNT', 100)
  redis.scan.mockImplementation(async (_cursor: string, ...args: unknown[]) => {
    const matchIdx = args.indexOf('MATCH');
    const pattern = (args[matchIdx + 1] as string) ?? '*';
    const regex = new RegExp('^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
    const matched = Array.from(cacheStore.keys()).filter((k) => regex.test(k));
    return ['0', matched] as [string, string[]];
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  _redisMockState.cacheStore.clear();
  setupMockRedis();
});

// ===== list =====
describe('contentService.list', () => {
  it('带 type 过滤时 where 包含 type', async () => {
    mockedPrisma.content.findMany.mockResolvedValue([]);
    mockedPrisma.content.count.mockResolvedValue(0);

    const result = await contentService.list({ type: 'marathon', page: 1, pageSize: 20 });

    expect(result.total).toBe(0);
    expect(mockedPrisma.content.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: 'marathon', status: 'on' }),
      }),
    );
  });

  it('无 type 时 where 不含 type', async () => {
    mockedPrisma.content.findMany.mockResolvedValue([]);
    mockedPrisma.content.count.mockResolvedValue(0);

    await contentService.list({ page: 1, pageSize: 20 });

    expect(mockedPrisma.content.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: 'on' },
      }),
    );
  });

  it('price/fee Decimal 序列化为 string（V0.1.10）', async () => {
    mockedPrisma.content.findMany.mockResolvedValue([
      {
        id: 'c1',
        type: 'marathon',
        title: '马拉松',
        price: { toString: () => '199.00' },
        fee: { toString: () => '50.00' },
      },
      {
        id: 'c2',
        type: 'hotel',
        title: '酒店',
        price: null,
        fee: null,
      },
    ] as never);
    mockedPrisma.content.count.mockResolvedValue(2);

    const result = await contentService.list({ page: 1, pageSize: 20 });

    expect(result.list[0].price).toBe('199.00');
    expect(result.list[0].fee).toBe('50.00');
    // null 保持 null
    expect(result.list[1].price).toBeNull();
    expect(result.list[1].fee).toBeNull();
  });

  it('首次调用：miss → 查 DB + 回填缓存', async () => {
    mockedPrisma.content.findMany.mockResolvedValue([] as never);
    mockedPrisma.content.count.mockResolvedValue(0);

    await contentService.list({ page: 1, pageSize: 10 });

    expect(mockedPrisma.content.findMany).toHaveBeenCalledTimes(1);
    expect(_redisMockState.cacheStore.has('qmwx:cache:content:list::1:10')).toBe(true);
  });

  it('二次同参：命中缓存 → 不再调 DB', async () => {
    // 预热缓存
    _redisMockState.cacheStore.set(
      'qmwx:cache:content:list:marathon:1:10',
      JSON.stringify({ list: [{ id: 'c1', title: '缓存内容' }], total: 1, page: 1, pageSize: 10 }),
    );

    const result = await contentService.list({ type: 'marathon', page: 1, pageSize: 10 });

    expect(result.list[0].title).toBe('缓存内容');
    expect(mockedPrisma.content.findMany).not.toHaveBeenCalled();
    expect(mockedPrisma.content.count).not.toHaveBeenCalled();
  });

  it('不同 type/分页 → 不同 cache key（不串扰）', async () => {
    mockedPrisma.content.findMany.mockResolvedValue([] as never);
    mockedPrisma.content.count.mockResolvedValue(0);

    await contentService.list({ page: 1, pageSize: 10 });
    await contentService.list({ type: 'marathon', page: 1, pageSize: 10 });
    await contentService.list({ page: 2, pageSize: 10 });

    expect(_redisMockState.cacheStore.has('qmwx:cache:content:list::1:10')).toBe(true);
    expect(_redisMockState.cacheStore.has('qmwx:cache:content:list:marathon:1:10')).toBe(true);
    expect(_redisMockState.cacheStore.has('qmwx:cache:content:list::2:10')).toBe(true);
  });
});

// ===== detail =====
describe('contentService.detail', () => {
  it('下架内容抛 notFound（不缓存，防穿透）', async () => {
    mockedPrisma.content.findUnique.mockResolvedValue({ status: 'off' } as never);
    await expect(contentService.detail('c1')).rejects.toThrow('内容已下架');
    expect(_redisMockState.cacheStore.has('qmwx:cache:content:detail:c1')).toBe(false);
  });

  it('不存在抛 notFound（不缓存）', async () => {
    mockedPrisma.content.findUnique.mockResolvedValue(null);
    await expect(contentService.detail('c1')).rejects.toThrow('内容不存在');
    expect(_redisMockState.cacheStore.has('qmwx:cache:content:detail:c1')).toBe(false);
  });

  it('正常返回 on 状态内容 + Decimal 序列化 + 回填缓存', async () => {
    const c = {
      id: 'c1',
      status: 'on',
      title: '马拉松',
      type: 'marathon',
      price: { toString: () => '99.00' },
      fee: null,
    };
    mockedPrisma.content.findUnique.mockResolvedValue(c as never);

    const result = await contentService.detail('c1');
    expect(result.content.title).toBe('马拉松');
    expect(result.content.price).toBe('99.00');
    expect(result.content.fee).toBeNull();
    // 缓存已回填
    expect(_redisMockState.cacheStore.has('qmwx:cache:content:detail:c1')).toBe(true);
  });

  it('二次同 id：命中缓存 → 不再调 findUnique', async () => {
    // 预热
    _redisMockState.cacheStore.set(
      'qmwx:cache:content:detail:c2',
      JSON.stringify({
        content: { id: 'c2', title: '缓存详情', price: null, fee: null, status: 'on' },
      }),
    );

    const result = await contentService.detail('c2');
    expect(result.content.title).toBe('缓存详情');
    expect(mockedPrisma.content.findUnique).not.toHaveBeenCalled();
  });
});

// ===== enroll（不变，但需 redis mock 在场）=====
describe('contentService.enroll', () => {
  const formData = { name: '张三', phone: '13800001111' };

  it('actionType=none 拒绝报名', async () => {
    mockedPrisma.content.findUnique.mockResolvedValue({
      id: 'c1',
      status: 'on',
      type: 'marathon',
      actionType: 'none',
    } as never);
    await expect(
      contentService.enroll('u1', { id: 'c1', formData }),
    ).rejects.toThrow('仅展示');
  });

  it('已存在 submitted/confirmed 报名 → 拒绝重复', async () => {
    mockedPrisma.content.findUnique.mockResolvedValue({
      id: 'c1', status: 'on', type: 'marathon', actionType: 'enroll',
    } as never);
    mockedPrisma.enrollment.findFirst.mockResolvedValue({ id: 'e1', status: 'submitted' } as never);

    await expect(contentService.enroll('u1', { id: 'c1', formData })).rejects.toThrow('已提交过');
  });

  it('正常报名：写 enrollments + 返 enrollmentId', async () => {
    mockedPrisma.content.findUnique.mockResolvedValue({
      id: 'c1', status: 'on', type: 'marathon', actionType: 'enroll',
    } as never);
    mockedPrisma.enrollment.findFirst.mockResolvedValue(null);
    mockedPrisma.enrollment.create.mockResolvedValue({ id: 'e-new' } as never);

    const result = await contentService.enroll('u1', { id: 'c1', formData });
    expect(result.enrollmentId).toBe('e-new');
    expect(mockedPrisma.enrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          contentId: 'c1',
          type: 'marathon',
          formData,
          status: 'submitted',
        }),
      }),
    );
  });
});

// ===== 写后失效 =====
describe('invalidateContentsCache（admin 写后 pattern 失效，V0.1.10）', () => {
  it('抹掉所有 content:* 命名空间缓存（list 全分页 + detail 全 id）', async () => {
    _redisMockState.cacheStore.set('qmwx:cache:content:list::1:10', '{}');
    _redisMockState.cacheStore.set('qmwx:cache:content:list:marathon:1:10', '{}');
    _redisMockState.cacheStore.set('qmwx:cache:content:detail:c1', '{}');
    // 无关 mall key 不该被抹
    _redisMockState.cacheStore.set('qmwx:cache:mall:listProducts::::1:10', '{}');

    const deleted = await invalidateContentsCache();

    expect(deleted).toBe(3);
    expect(_redisMockState.cacheStore.has('qmwx:cache:content:list::1:10')).toBe(false);
    expect(_redisMockState.cacheStore.has('qmwx:cache:content:list:marathon:1:10')).toBe(false);
    expect(_redisMockState.cacheStore.has('qmwx:cache:content:detail:c1')).toBe(false);
    // 无关 mall key 保持
    expect(_redisMockState.cacheStore.has('qmwx:cache:mall:listProducts::::1:10')).toBe(true);
  });
});

describe('invalidateContentDetail（精准单 key 失效，V0.1.10）', () => {
  it('精准删单个 contentId 缓存，不影响其他', async () => {
    _redisMockState.cacheStore.set('qmwx:cache:content:detail:c1', '{}');
    _redisMockState.cacheStore.set('qmwx:cache:content:detail:c2', '{}');
    _redisMockState.cacheStore.set('qmwx:cache:content:list::1:10', '{}');

    await invalidateContentDetail('c1');

    expect(_redisMockState.cacheStore.has('qmwx:cache:content:detail:c1')).toBe(false);
    expect(_redisMockState.cacheStore.has('qmwx:cache:content:detail:c2')).toBe(true);
    // list 缓存保持（精准失效不动它）
    expect(_redisMockState.cacheStore.has('qmwx:cache:content:list::1:10')).toBe(true);
  });

  it('cache miss 时调用也安全', async () => {
    // .then(() => 1) 永远返 1
    await expect(invalidateContentDetail('ghost')).resolves.toBe(1);
  });
});
