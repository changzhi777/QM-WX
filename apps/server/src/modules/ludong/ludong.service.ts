/**
 * ludong module service — STUB
 *
 * Phase 7+ 实现：与律动平台双向对接
 *
 * 出站（A：出站到律动）：
 * - 业务写库成功时同事务写 sync_outbox（pending）
 * - 定时函数批量投递 → 律动应答 200 后置 done
 * - 失败指数退避重试，超 24h 转 dead 并告警
 *
 * 入站（B：律动 → 我方）：
 * - HTTP 触发 /webhook/ludong
 * - 验签（HMAC-SHA256）→ 幂等（按 eventId 查重）→ upsert recipes/contents/products
 */
import { Errors } from '../../common/errors.js';
import type { BindLudongInput, ListOutboxInput } from './ludong.schema.js';

export const ludongService = {
  /** 列出 outbox 队列（管理后台用） */
  async listOutbox(_input: ListOutboxInput) {
    return { list: [], total: 0 };
  },

  /** 手动 flush outbox（运维用） */
  async flushOutbox() {
    // TODO Phase 7+：调 5 分钟定时函数同样的逻辑
    return { flushed: 0, dead: 0 };
  },

  /**
   * 绑定律动账号
   *
   * 流程：手机号 → 律动发短信验证码 → 我方校验 → 律动返 ludongUserId → 写 id_mappings
   */
  async bindAccount(_userId: string, _input: BindLudongInput) {
    // TODO Phase 7+
    throw Errors.notImplemented('bindAccount');
  },

  /** 查绑定状态 */
  async bindingStatus(_userId: string) {
    return { bound: false, ludongUserId: null, boundAt: null };
  },

  /**
   * 内部：业务 service 调，写 outbox
   * 在事务里调用，保证业务写库 + outbox 原子性
   */
  async enqueueInTx(
    _tx: unknown,
    _type: 'user.upsert' | 'checkin.batch' | 'order.sync' | 'points.sync',
    _payload: unknown,
  ) {
    // TODO Phase 7+
    return { eventId: 'placeholder' };
  },
};
