/**
 * Order 状态机
 *
 * 单一权威：所有 Order.status 转换必须走 canTransition / assertTransition，
 * 业务层不允许直接拼字符串。
 *
 * 状态语义（V1 + V2 stub）：
 * - pending_pay   待支付（订单创建默认）
 * - paid          已支付（微信 notify 确认后）
 * - shipped      已发货（管理员确认发货后，V1 占位）
 * - done          已完成（用户确认收货 / 物流签收后，V1 占位）
 * - cancelled     已取消（用户主动取消 / 超时关单）
 * - refunding     退款中（admin 发起退款、等待微信返回）
 * - refunded      已退款（微信 refund 成功 + 钱包扣减完成）
 *
 * 转换白名单（其它所有组合 → 抛 illegal_state）：
 * - pending_pay → paid（wxpay notify 成功）
 * - pending_pay → cancelled（用户取消 / 超时关单）
 * - paid → shipped（admin 发货，V1 占位）
 * - paid → refunding（admin 发起退款）
 * - paid → refunded（**MVP 简化**：微信 refund 同步成功，refunding 是无意义过渡态）
 * - refunding → refunded（保留：真生产异步退款可走此路径）
 * - refunding → paid（wxpay refund API 失败，回滚）
 * - shipped → done（用户确认收货，V1 占位）
 */
import { BusinessError } from '../common/errors.js';

export type OrderStatus =
  | 'pending_pay'
  | 'paid'
  | 'shipped'
  | 'done'
  | 'cancelled'
  | 'refunding'
  | 'refunded';

const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_pay: ['paid', 'cancelled'],
  paid: ['shipped', 'refunding', 'refunded'], // MVP: 直跳 refunded
  shipped: ['done'],
  done: [], // 终态
  cancelled: [], // 终态
  refunding: ['refunded', 'paid'], // 成功→refunded / 失败→回滚 paid
  refunded: [], // 终态
};

/** 查表：from → to 是否在白名单内 */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/**
 * 断言合法，非法抛 BusinessError(409, 'illegal_state: {from} → {to}')
 *
 * 用法（业务层替换所有 status 硬编码）：
 *   assertTransition(order.status, 'paid');
 *   await tx.order.update({ where: { id }, data: { status: 'paid' } });
 */
export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new BusinessError(
      409,
      `illegal_state: ${from} → ${to}`,
      409,
    );
  }
}

/** 终态判断（UI 隐藏按钮用） */
export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}
