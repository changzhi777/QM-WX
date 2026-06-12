/**
 * Prisma mock 工厂
 *
 * 用法：
 * ```ts
 * const mocks = vi.hoisted(() => createPrismaMock({
 *   models: ['wallet', 'walletTransaction'],
 *   txModels: ['wallet', 'walletTransaction'],  // 事务内用到的同名 model
 * }));
 *
 * vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));
 *
 * // 测试中：
 * mocks.prisma.wallet.findUnique.mockResolvedValue(makeWallet());
 * mocks.tx.wallet.update.mockResolvedValue(...);
 * ```
 *
 * 注意：因 vi.hoisted 在 vi.mock 之前执行，工厂内可以用 vi.fn()。
 */
import { vi, type Mock } from 'vitest';

type MethodName =
  | 'findUnique'
  | 'findFirst'
  | 'findMany'
  | 'create'
  | 'createMany'
  | 'update'
  | 'updateMany'
  | 'upsert'
  | 'delete'
  | 'deleteMany'
  | 'count'
  | 'aggregate'
  | 'groupBy';

const ALL_METHODS: readonly MethodName[] = [
  'findUnique',
  'findFirst',
  'findMany',
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
  'count',
  'aggregate',
  'groupBy',
] as const;

export type PrismaModelMock = Record<MethodName, Mock>;
export type PrismaTxMock = Record<string, PrismaModelMock>;

export interface PrismaMockOptions {
  /** 顶层 prisma.xxx 上要挂的 model 名列表（如 ['user', 'wallet']） */
  models: string[];
  /** 事务内 tx.xxx 上要挂的 model 名列表，缺省 = models */
  txModels?: string[];
  /** 限制每个 model 只挂某几个方法（默认全挂） */
  methods?: MethodName[];
}

export interface PrismaMockResult {
  prisma: Record<string, PrismaModelMock> & { $transaction: Mock };
  tx: PrismaTxMock;
}

/**
 * 创建 Prisma + transaction 双层 mock。
 * `$transaction(fn)` 自动用 tx 调用 fn，让 service 内 `prisma.$transaction(async tx => ...)`
 * 的回调直接拿到 mock。
 */
export function createPrismaMock(opts: PrismaMockOptions): PrismaMockResult {
  const methods = opts.methods ?? ALL_METHODS;
  const txModels = opts.txModels ?? opts.models;

  const makeModelMock = (): PrismaModelMock => {
    const m = {} as PrismaModelMock;
    methods.forEach((name) => {
      m[name] = vi.fn();
    });
    return m;
  };

  const prisma: Record<string, PrismaModelMock> & { $transaction: Mock } = {
    $transaction: vi.fn(),
  };
  opts.models.forEach((name) => {
    prisma[name] = makeModelMock();
  });

  const tx: PrismaTxMock = {};
  txModels.forEach((name) => {
    tx[name] = makeModelMock();
  });

  // $transaction(fn) → fn(tx)
  prisma.$transaction.mockImplementation((fn: (t: PrismaTxMock) => unknown) => fn(tx));

  return { prisma, tx };
}
