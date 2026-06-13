/**
 * wallet module data access
 *
 * 集中钱包相关数据访问。
 * 当前只放 ensureWallet — 因为它在 service 内（get / transactions）
 * 和潜在的事务内（wxpay 回调 → WalletTransaction 写入）都要用。
 *
 * 后续如 wallet 相关查询/写入增多，再扩。
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../infra/prisma.js';

/** 既能接顶层 prisma，也能接事务内 tx */
type Client = PrismaClient | Prisma.TransactionClient;

export const walletRepo = {
  /**
   * 事务外：自动建空钱包（首次访问）
   *
   * 等价于原来的 walletService.ensureWallet。
   * 业务：get / transactions / 任何 service 内的"先用再问"。
   */
  async ensureWallet(userId: string) {
    return ensureWalletInternal(prisma, userId);
  },

  /**
   * 事务内：保证当前事务拿得到 wallet（必须存在），用于写 WalletTransaction 前置
   *
   * 调用方必须包裹在 `prisma.$transaction(async tx => ...)` 内。
   * 若事务前已用过 ensureWallet，可直接传该 wallet.id；此函数用于兜底。
   */
  async ensureWalletInTx(tx: Prisma.TransactionClient, userId: string) {
    return ensureWalletInternal(tx, userId);
  },
};

/**
 * 内部：findUnique → 不存在则 create
 *
 * 故意不用 upsert：并发下两个 findUnique 都返回 null → 两个 create 会
 * 由 unique 约束兜底（不是 bug，是想要的 fail-fast），比 upsert 静默
 * 吞掉 race 更安全。
 */
async function ensureWalletInternal(client: Client, userId: string) {
  const existing = await client.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return client.wallet.create({
    data: { userId, balance: 0, status: 'active' },
  });
}
