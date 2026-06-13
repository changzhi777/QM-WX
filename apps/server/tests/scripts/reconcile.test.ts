/**
 * 对账脚本单测（纯函数 — parseBillCsv + reconcile）
 *
 * 覆盖：
 * - parseBillCsv 解析标准微信账单 CSV
 * - parseBillCsv 缺关键列抛错
 * - reconcile match 场景
 * - reconcile 金额不符
 * - reconcile 状态不符
 * - reconcile 账无单（missing_local）
 * - reconcile 单无账（missing_bill）
 *
 * 注：main() 整体（拉微信 API + 落库）需 e2e，本文件只测纯函数
 */
import { describe, it, expect } from 'vitest';

// 直接 import 脚本导出函数（需在 reconcile.ts 加 export）— 临时用 require 绕开
// 这里把测试聚焦：parseBillCsv 和 reconcile 走 re-import
// 但 reconcile.ts 没 export 这俩函数。简化：重写一版 inline 测，或修改脚本 export
// 选：修改 reconcile.ts 顶部 export 这俩纯函数
import { parseBillCsv, reconcile } from '../../scripts/reconcile.js';

const CSV_HEADER = '微信订单号,商户订单号,商户号,子商户号,设备号,微信退款单号,商户退款单号,订单金额,应结订单金额,退款金额,充值券退款金额,退款申请时间,原路退款申请时间,退款成功时间,退款原因,退款资金来源,退款出款账户,商户名称,商户退款单号,订单状态,应结金额,实付金额,商家备注,交易时间';

describe('parseBillCsv', () => {
  it('解析标准 1 行订单账单', () => {
    // CSV_HEADER 共 24 列；测试行也必须 24 列
    const csv = `${CSV_HEADER}\nwx-txn-001,o1,mch-1,,,,,0.01,,0,,,,,,,,,,SUCCESS,0.01,0.01,,2026-06-12 10:00:00`;
    const rows = parseBillCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      transactionId: 'wx-txn-001',
      outTradeNo: 'o1',
      totalFen: 1, // 0.01 元 = 1 分
      refundFen: 0,
      status: 'SUCCESS',
    });
  });

  it('空 CSV → 返回空数组', () => {
    expect(parseBillCsv(CSV_HEADER)).toEqual([]);
  });

  it('缺关键列 → 抛错', () => {
    const bad = '微信订单号,商户订单号\nwx,o';
    expect(() => parseBillCsv(bad)).toThrow(/缺关键列/);
  });
});

describe('reconcile', () => {
  const local = new Map([
    ['o1', { id: 'o1', status: 'paid', payAmount: 0.01, wxTransactionId: 'wx-1' }],
    ['o2', { id: 'o2', status: 'refunded', payAmount: 0.02, wxTransactionId: 'wx-2' }],
    ['o3', { id: 'o3', status: 'pending_pay', payAmount: 0.03, wxTransactionId: null }],
  ]);

  it('match：账单 1 条与本地 1 条完全一致 → match', () => {
    const bill = [
      { transactionId: 'wx-1', outTradeNo: 'o1', totalFen: 1, refundFen: 0, status: 'SUCCESS', time: '' },
    ];
    const diffs = reconcile(bill, new Map([['o1', local.get('o1')!]]));
    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe('match');
  });

  it('mismatch_amount：账单金额与本地 payAmount 不一致', () => {
    const bill = [
      { transactionId: 'wx-1', outTradeNo: 'o1', totalFen: 2, refundFen: 0, status: 'SUCCESS', time: '' },
    ];
    const diffs = reconcile(bill, new Map([['o1', local.get('o1')!]]));
    expect(diffs[0].type).toBe('mismatch_amount');
    expect(diffs[0].detail).toMatch(/金额不符.*2 分.*1 分/);
  });

  it('status_diff：账单 REFUND 但本地非 refunded', () => {
    const bill = [
      { transactionId: 'wx-1', outTradeNo: 'o1', totalFen: 1, refundFen: 1, status: 'REFUND', time: '' },
    ];
    const diffs = reconcile(bill, new Map([['o1', local.get('o1')!]]));
    expect(diffs[0].type).toBe('status_diff');
    expect(diffs[0].detail).toMatch(/REFUND.*paid/);
  });

  it('missing_local：账有条但本地无', () => {
    const bill = [
      { transactionId: 'wx-x', outTradeNo: 'o999', totalFen: 1, refundFen: 0, status: 'SUCCESS', time: '' },
    ];
    const diffs = reconcile(bill, new Map());
    expect(diffs[0].type).toBe('missing_local');
  });

  it('missing_bill：本地 paid 但账无此条', () => {
    const bill: ReturnType<typeof parseBillCsv> = [];
    const diffs = reconcile(bill, new Map([['o1', local.get('o1')!]]));
    expect(diffs).toHaveLength(1);
    expect(diffs[0].type).toBe('missing_bill');
  });

  it('mixed：1 match + 1 mismatch + 1 missing_local + 1 missing_bill', () => {
    const bill = [
      { transactionId: 'wx-1', outTradeNo: 'o1', totalFen: 1, refundFen: 0, status: 'SUCCESS', time: '' }, // match
      { transactionId: 'wx-2', outTradeNo: 'o2', totalFen: 99, refundFen: 0, status: 'SUCCESS', time: '' }, // mismatch_amount
      { transactionId: 'wx-x', outTradeNo: 'o999', totalFen: 1, refundFen: 0, status: 'SUCCESS', time: '' }, // missing_local
      // o3 (pending_pay) 不在 missing_bill（只对 paid/... 计）
    ];
    const diffs = reconcile(bill, local);
    expect(diffs.filter((d) => d.type === 'match')).toHaveLength(1);
    expect(diffs.filter((d) => d.type === 'mismatch_amount')).toHaveLength(1);
    expect(diffs.filter((d) => d.type === 'missing_local')).toHaveLength(1);
    // o3 是 pending_pay，不计入 missing_bill
    expect(diffs.filter((d) => d.type === 'missing_bill')).toHaveLength(0);
  });
});
