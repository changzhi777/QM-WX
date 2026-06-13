/**
 * 每日对账脚本（V1 — 手动 CLI）
 *
 * 流程：
 * 1. 调 wxpay.service.queryBill(date) 拿账单 download_url
 * 2. 下载 zip → 解压 → 读 CSV
 * 3. 与本地 Order 比对（按 wxTransactionId 匹配 + 金额核对）
 * 4. 输出 diff 报告到 stdout（missing / mismatch / match 三类）
 *
 * 用法：
 *   pnpm reconcile -- 2026-06-12
 *   pnpm reconcile -- 2026-06-12 --json
 *
 * 注：
 * - 沙箱测试：queryBill / downloadBill 走 mock（env 缺 WX_MCH_* 时直接报配置缺失）
 * - 真生产：需 WX_MCH_ID / WX_MCH_SERIAL_NO / WX_MCH_PRIVATE_KEY_PATH / WX_PLAT_CERT_PATH
 */
import { prisma } from '../src/infra/prisma.js';
import { logger } from '../src/common/logger.js';

interface BillRow {
  transactionId: string; // 微信订单号
  outTradeNo: string; // 商户订单号（= Order.id）
  totalFen: number; // 订单金额（分）
  refundFen: number; // 退款金额（分）
  status: string; // SUCCESS / REFUND
  time: string;
}

interface DiffRow {
  type: 'match' | 'mismatch_amount' | 'missing_local' | 'missing_bill' | 'status_diff';
  transactionId: string;
  outTradeNo: string;
  billTotalFen?: number;
  billRefundFen?: number;
  localStatus?: string;
  localPayAmountFen?: number;
  detail: string;
}

/**
 * 解析微信账单 CSV
 *
 * 微信账单格式（all-order 格式）：
 * 微信订单号,商户订单号,商户号,子商户号,设备号,微信退款单号,商户退款单号,订单金额,应结订单金额,退款金额,充值券退款金额,退款申请时间,原路退款申请时间,退款成功时间,退款原因,退款资金来源,退款出款账户,商户名称,商户退款单号,订单状态,应结金额,实付金额,商家备注
 *
 * MVP 简化：只取 微信订单号 / 商户订单号 / 订单金额 / 退款金额 / 订单状态 / 交易时间
 */
export function parseBillCsv(csv: string): BillRow[] {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const header = lines[0].split(',');
  const idx = {
    transactionId: header.indexOf('微信订单号'),
    outTradeNo: header.indexOf('商户订单号'),
    totalFen: header.indexOf('订单金额'),
    refundFen: header.indexOf('退款金额'),
    status: header.indexOf('订单状态'),
    time: header.indexOf('交易时间'),
  };
  // 校验关键列
  for (const [k, v] of Object.entries(idx)) {
    if (v < 0) throw new Error(`账单 CSV 缺关键列: ${k}`);
  }
  return lines.slice(1).map((line) => {
    const cols = line.split(',');
    return {
      transactionId: cols[idx.transactionId],
      outTradeNo: cols[idx.outTradeNo],
      totalFen: Math.round(Number(cols[idx.totalFen]) * 100), // 元 → 分
      refundFen: Math.round(Number(cols[idx.refundFen]) * 100),
      status: cols[idx.status],
      time: cols[idx.time] ?? '',
    };
  });
}

/**
 * 比对账单 vs 本地 Order
 *
 * MVP 简化：
 * - 按 outTradeNo 匹配
 * - 金额（payAmount vs totalFen）必须严格相等
 * - 状态：bill SUCCESS <-> order paid/...；bill REFUND <-> order refunded
 */
export function reconcile(billRows: BillRow[], localOrders: Map<string, { id: string; status: string; payAmount: number; wxTransactionId: string | null }>): DiffRow[] {
  const diffs: DiffRow[] = [];
  const seen = new Set<string>();

  for (const row of billRows) {
    seen.add(row.outTradeNo);
    const local = localOrders.get(row.outTradeNo);
    if (!local) {
      diffs.push({
        type: 'missing_local',
        transactionId: row.transactionId,
        outTradeNo: row.outTradeNo,
        billTotalFen: row.totalFen,
        detail: '本地无此订单',
      });
      continue;
    }
    const localTotalFen = Math.round(local.payAmount * 100);
    if (localTotalFen !== row.totalFen) {
      diffs.push({
        type: 'mismatch_amount',
        transactionId: row.transactionId,
        outTradeNo: row.outTradeNo,
        billTotalFen: row.totalFen,
        localPayAmountFen: localTotalFen,
        detail: `金额不符: 微信账单 ${row.totalFen} 分 vs 本地 ${localTotalFen} 分`,
      });
      continue;
    }
    // 状态粗校验
    if (row.status === 'SUCCESS' && local.status !== 'paid' && local.status !== 'shipped' && local.status !== 'done') {
      diffs.push({
        type: 'status_diff',
        transactionId: row.transactionId,
        outTradeNo: row.outTradeNo,
        billTotalFen: row.totalFen,
        localStatus: local.status,
        detail: `状态不符: 微信 SUCCESS vs 本地 ${local.status}`,
      });
      continue;
    }
    if (row.status === 'REFUND' && local.status !== 'refunded') {
      diffs.push({
        type: 'status_diff',
        transactionId: row.transactionId,
        outTradeNo: row.outTradeNo,
        billTotalFen: row.totalFen,
        localStatus: local.status,
        detail: `状态不符: 微信 REFUND vs 本地 ${local.status}`,
      });
      continue;
    }
    diffs.push({
      type: 'match',
      transactionId: row.transactionId,
      outTradeNo: row.outTradeNo,
      billTotalFen: row.totalFen,
      detail: 'OK',
    });
  }

  // 微信账无但本地有（且已 paid 等）→ 漏单
  for (const [orderId, local] of localOrders) {
    if (seen.has(orderId)) continue;
    if (local.status !== 'paid' && local.status !== 'shipped' && local.status !== 'done' && local.status !== 'refunded') continue;
    diffs.push({
      type: 'missing_bill',
      transactionId: local.wxTransactionId ?? '',
      outTradeNo: orderId,
      localStatus: local.status,
      detail: '本地有订单，微信账无此条',
    });
  }

  return diffs;
}

/**
 * 主流程：拉账单 + 比对 + 输出
 */
async function main() {
  const args = process.argv.slice(2);
  const date = args[0];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('用法: pnpm reconcile -- YYYY-MM-DD [--json]');
    process.exit(1);
  }
  const jsonMode = args.includes('--json');

  logger.info({ date }, 'reconcile started');

  // 1. 拉账单（沙箱走 mock，真生产需 WX_MCH_*）
  const { queryBill, downloadBill } = await import('../src/modules/wxpay/wxpay.service.js');
  let billCsv: string;
  try {
    const billMeta = await queryBill({ billDate: date, billType: 'ALL' });
    billCsv = await downloadBill(billMeta.downloadUrl);
  } catch (e) {
    logger.error({ err: (e as Error).message }, 'reconcile: 微信账单拉取失败');
    process.exit(1);
  }

  // 2. 解析
  const billRows = parseBillCsv(billCsv);
  logger.info({ rowCount: billRows.length }, 'reconcile: bill parsed');

  // 3. 查本地 Order（当日创建或当日 paid）
  const dayStart = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(`${date}T23:59:59.999Z`);
  const localOrders = await prisma.order.findMany({
    where: {
      OR: [
        { createdAt: { gte: dayStart, lte: dayEnd } },
        { paidAt: { gte: dayStart, lte: dayEnd } },
      ],
      wxTransactionId: { not: null },
    },
    select: { id: true, status: true, payAmount: true, wxTransactionId: true },
  });
  const orderMap = new Map(
    localOrders.map((o) => [o.id, { id: o.id, status: o.status, payAmount: Number(o.payAmount), wxTransactionId: o.wxTransactionId }]),
  );

  // 4. 比对
  const diffs = reconcile(billRows, orderMap);

  // 5. 输出
  if (jsonMode) {
    console.log(JSON.stringify({ date, billCount: billRows.length, localCount: orderMap.size, diffs }, null, 2));
  } else {
    const summary = {
      billCount: billRows.length,
      localCount: orderMap.size,
      match: diffs.filter((d) => d.type === 'match').length,
      mismatchAmount: diffs.filter((d) => d.type === 'mismatch_amount').length,
      missingLocal: diffs.filter((d) => d.type === 'missing_local').length,
      missingBill: diffs.filter((d) => d.type === 'missing_bill').length,
      statusDiff: diffs.filter((d) => d.type === 'status_diff').length,
    };
    console.log(`对账日期: ${date}`);
    console.log(`微信账单: ${summary.billCount} 条 / 本地订单: ${summary.localCount} 条`);
    console.log('---');
    console.log(`  ✓ 匹配:    ${summary.match}`);
    console.log(`  ✗ 金额不符: ${summary.mismatchAmount}`);
    console.log(`  ✗ 账无单:   ${summary.missingLocal}`);
    console.log(`  ✗ 单无账:   ${summary.missingBill}`);
    console.log(`  ✗ 状态不符: ${summary.statusDiff}`);
    if (diffs.some((d) => d.type !== 'match')) {
      console.log('\n不一致明细:');
      for (const d of diffs) {
        if (d.type === 'match') continue;
        console.log(`  [${d.type}] ${d.outTradeNo} (${d.transactionId}): ${d.detail}`);
      }
    }
  }

  // 非 0 退出码：有差异则退出 2（让 CI / cron 报警）
  const hasDiff = diffs.some((d) => d.type !== 'match');
  await prisma.$disconnect();
  process.exit(hasDiff ? 2 : 0);
}

// 仅当作为入口执行时才跑（被 import 时不跑）
// Node ESM：判断 import.meta.url === process.argv[1]
const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch(async (e) => {
    logger.error({ err: (e as Error).message }, 'reconcile fatal');
    await prisma.$disconnect();
    process.exit(1);
  });
}
