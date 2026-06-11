/**
 * jobs/weekly-report.job.ts — 周报 Job 处理器
 *
 * 流程：
 * 1. 取所有 active 群（或指定 groupId）
 * 2. 调 weeklyReportService.trigger(groupId) 生成报告 + 写 GroupReport
 * 3. 记录成功 / 失败
 *
 * 未来扩展：成功后触发订阅消息推送（等 模板 ID）
 */
import { prisma } from '../infra/prisma.js';
import { weeklyReportService } from '../modules/weekly-report/weekly-report.service.js';
import { logger } from '../common/logger.js';

export async function processWeeklyReport(data: { groupId?: string; period?: string }) {
  if (data.groupId) {
    // 单群：跳过 owner 鉴权（由 enqueue 时机控制；admin / 群主 触发的）
    const period = data.period ?? currentWeekPeriod();
    const start = currentWeekStart();
    const end = currentWeekEnd();
    const report = await weeklyReportService.aggregate(data.groupId, period, start, end);
    await prisma.groupReport.upsert({
      where: { groupId_period: { groupId: data.groupId, period } },
      create: { groupId: data.groupId, period, summary: report as never },
      update: { summary: report as never },
    });
    logger.info({ groupId: data.groupId, period }, 'weekly-report single done');
    return { ok: true, period, report };
  }

  // 全量：扫所有群
  const groups = await prisma.group.findMany({ select: { id: true, ownerId: true } });
  const period = data.period ?? currentWeekPeriod();
  const start = currentWeekStart();
  const end = currentWeekEnd();

  const results: { groupId: string; ok: boolean; error?: string }[] = [];
  for (const g of groups) {
    try {
      const report = await weeklyReportService.aggregate(g.id, period, start, end);
      await prisma.groupReport.upsert({
        where: { groupId_period: { groupId: g.id, period } },
        create: { groupId: g.id, period, summary: report as never },
        update: { summary: report as never },
      });
      results.push({ groupId: g.id, ok: true });
    } catch (err) {
      results.push({ groupId: g.id, ok: false, error: (err as Error).message });
    }
  }
  const okCount = results.filter((r) => r.ok).length;
  logger.info(
    { total: groups.length, ok: okCount, fail: groups.length - okCount, period },
    'weekly-report all-done',
  );
  return { total: groups.length, ok: okCount, fail: groups.length - okCount, period };
}

// ===== 工具：当前周编号 =====
function currentWeekPeriod(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  const tmp = new Date(d);
  tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
  const yearStart = new Date(tmp.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;
}

function currentWeekStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  return d;
}

function currentWeekEnd(): Date {
  const d = currentWeekStart();
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}
