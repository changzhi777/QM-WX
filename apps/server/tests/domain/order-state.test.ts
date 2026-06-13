/**
 * Order 状态机单测
 *
 * 覆盖：所有合法转换 + 关键非法边界 + 终态判断
 */
import { describe, it, expect } from 'vitest';
import {
  canTransition,
  assertTransition,
  isTerminal,
  type OrderStatus,
} from '../../src/domain/order-state.js';

const ALL: OrderStatus[] = [
  'pending_pay',
  'paid',
  'shipped',
  'done',
  'cancelled',
  'refunding',
  'refunded',
];

describe('canTransition — 合法转换', () => {
  it('pending_pay → paid', () => {
    expect(canTransition('pending_pay', 'paid')).toBe(true);
  });
  it('pending_pay → cancelled（用户取消 / 超时关单）', () => {
    expect(canTransition('pending_pay', 'cancelled')).toBe(true);
  });
  it('paid → shipped', () => {
    expect(canTransition('paid', 'shipped')).toBe(true);
  });
  it('paid → refunding（admin 发起退款）', () => {
    expect(canTransition('paid', 'refunding')).toBe(true);
  });
  it('paid → refunded（MVP 简化：微信 refund 同步成功直跳）', () => {
    expect(canTransition('paid', 'refunded')).toBe(true);
  });
  it('refunding → refunded（微信 refund 成功）', () => {
    expect(canTransition('refunding', 'refunded')).toBe(true);
  });
  it('refunding → paid（微信 refund 失败回滚）', () => {
    expect(canTransition('refunding', 'paid')).toBe(true);
  });
  it('shipped → done', () => {
    expect(canTransition('shipped', 'done')).toBe(true);
  });
});

describe('canTransition — 非法转换', () => {
  it('pending_pay 不能直接 → shipped', () => {
    expect(canTransition('pending_pay', 'shipped')).toBe(false);
  });
  it('pending_pay 不能直接 → refunded', () => {
    expect(canTransition('pending_pay', 'refunded')).toBe(false);
  });
  it('paid 不能直接 → cancelled（必须先 refund 或走 admin 流程）', () => {
    expect(canTransition('paid', 'cancelled')).toBe(false);
  });
  it('done 是终态，不能再转换', () => {
    for (const to of ALL) {
      expect(canTransition('done', to), `done → ${to}`).toBe(false);
    }
  });
  it('cancelled 是终态，不能再转换', () => {
    for (const to of ALL) {
      expect(canTransition('cancelled', to), `cancelled → ${to}`).toBe(false);
    }
  });
  it('refunded 是终态，不能再转换', () => {
    for (const to of ALL) {
      expect(canTransition('refunded', to), `refunded → ${to}`).toBe(false);
    }
  });
  it('shipped 不能再 → paid（不允许回退）', () => {
    expect(canTransition('shipped', 'paid')).toBe(false);
  });
  it('shipped 不能再 → refunding（已发货不能直接退，需先走 done/协商）', () => {
    expect(canTransition('shipped', 'refunding')).toBe(false);
  });
});

describe('assertTransition — 抛错行为', () => {
  it('合法转换不抛错', () => {
    expect(() => assertTransition('pending_pay', 'paid')).not.toThrow();
  });
  it('非法转换抛 BusinessError(409, "illegal_state: X → Y")', () => {
    try {
      assertTransition('done', 'paid');
      expect.fail('应该抛错');
    } catch (e) {
      expect((e as Error).message).toMatch(/illegal_state: done → paid/);
      expect((e as { statusCode?: number }).statusCode).toBe(409);
    }
  });
  it('非法转换抛错对象是 BusinessError', () => {
    try {
      assertTransition('refunded', 'paid');
    } catch (e) {
      expect((e as { code?: number }).code).toBe(409);
    }
  });
});

describe('isTerminal — 终态判断', () => {
  it('done / cancelled / refunded 是终态', () => {
    expect(isTerminal('done')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(isTerminal('refunded')).toBe(true);
  });
  it('pending_pay / paid / shipped / refunding 不是终态', () => {
    expect(isTerminal('pending_pay')).toBe(false);
    expect(isTerminal('paid')).toBe(false);
    expect(isTerminal('shipped')).toBe(false);
    expect(isTerminal('refunding')).toBe(false);
  });
});
