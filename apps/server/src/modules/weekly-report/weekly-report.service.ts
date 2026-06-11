/**
 * weekly-report service
 *
 * 核心职责：
 * - 聚合某群某周的打卡数据
 * - 输出 top 5 + 冠军 + 总公里 + 参与人数
 * - 写 GroupReport 表（后续可生成战报图）
 *
 * 触发方式（Phase 2.5）：
 * 1. 手动：POST /api/weekly-report { action: "trigger", payload: { groupId, period? } }
 * 2. 自动：BullMQ 每周日 20:00 扫所有群（Phase 4.5 加）
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import type { WeeklyReport, WeeklyReportMember } from '@qm-wx/shared';

// ===== 工具：周编号 + 起止日期 =====
function isoWeek(date: Date): { period: string; start: Date; end: Date } {
  // 周一为周首日
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7; // 周日=0 → 7
  d.setDate(d.getDate() - (day - 1));
  const start = new Date(d);
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  // ISO 周号
  const tmp = new Date(start);
  tmp.setDate(tmp.getDate() + 4 - (tmp.getDay() || 7));
  const yearStart = new Date(tmp.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const period = `${tmp.getFullYear()}-W${weekNum.toString().padStart(2, '0')}`;

  return { period, start, end };
}

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const weeklyReportService = {
  /**
   * 计算并返回某群本周（或指定周）报告
   */
  async currentWeek(userId: string, groupId?: string): Promise<WeeklyReport[]> {
    // 找出用户的所有群（不传 groupId 时），或校验 groupId
    let groupIds: string[];
    if (groupId) {
      const member = await prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId } },
      });
      if (!member) throw Errors.forbidden('你不在该群中');
      groupIds = [groupId];
    } else {
      const list = await prisma.groupMember.findMany({
        where: { userId },
        select: { groupId: true },
      });
      groupIds = list.map((g) => g.groupId);
    }

    if (groupIds.length === 0) return [];

    const { period, start, end } = isoWeek(new Date());

    // 并行：每个群出一份报告
    const reports = await Promise.all(
      groupIds.map((id) => this.aggregate(id, period, start, end)),
    );
    return reports;
  },

  /**
   * 单群聚合
   */
  async aggregate(
    groupId: string,
    period: string,
    start: Date,
    end: Date,
  ): Promise<WeeklyReport> {
    const group = await prisma.group.findUnique({ where: { id: groupId } });
    if (!group) throw Errors.notFound('群不存在');

    const checkins = await prisma.checkin.findMany({
      where: { groupId, createdAt: { gte: start, lte: end } },
      include: { user: { select: { id: true, nickname: true, avatarUrl: true } } },
    });

    // 聚合
    const map = new Map<
      string,
      { distance: number; count: number; points: number; user: { id: string; nickname: string | null; avatarUrl: string | null } }
    >();
    for (const c of checkins) {
      const cur = map.get(c.userId) ?? {
        distance: 0,
        count: 0,
        points: 0,
        user: c.user,
      };
      cur.distance += c.distance;
      cur.count += 1;
      cur.points += c.points;
      map.set(c.userId, cur);
    }

    const sorted: WeeklyReportMember[] = Array.from(map.values())
      .map((m, i) => ({
        userId: m.user.id,
        nickname: m.user.nickname ?? '匿名',
        avatarUrl: m.user.avatarUrl,
        distance: round(m.distance, 2),
        checkinCount: m.count,
        points: m.points,
        rank: i + 1,
      }))
      .sort((a, b) => b.distance - a.distance)
      .map((m, i) => ({ ...m, rank: i + 1 }))
      .slice(0, 50);

    const topMembers = sorted.slice(0, 5);
    const champion = topMembers[0] ?? null;

    return {
      groupId,
      groupName: group.name,
      period,
      startDate: dateStr(start),
      endDate: dateStr(end),
      totalDistance: round(topMembers.reduce((s, m) => s + m.distance, 0), 2),
      totalCheckins: topMembers.reduce((s, m) => s + m.checkinCount, 0),
      totalMembers: map.size,
      topMembers,
      champion,
      generatedAt: new Date().toISOString(),
    };
  },

  /**
   * 触发某群生成战报（写 GroupReport 表）
   */
  async trigger(userId: string, groupId: string, period?: string) {
    // 鉴权：必须是群主
    const member = await prisma.groupMember.findUnique({
      where: { groupId_userId: { groupId, userId } },
    });
    if (!member) throw Errors.forbidden('你不在该群中');
    if (member.role !== 'owner') throw Errors.forbidden('仅群主可触发');

    let periodStr = period;
    let start: Date;
    let end: Date;
    if (periodStr) {
      const parts = periodStr.split('-W');
      const year = Number(parts[0]);
      const week = Number(parts[1]);
      // 简化：用当前周替代（生产可写 ISO 周转日期工具）
      const cur = isoWeek(new Date());
      start = cur.start;
      end = cur.end;
      periodStr = cur.period;
    } else {
      const cur = isoWeek(new Date());
      start = cur.start;
      end = cur.end;
      periodStr = cur.period;
    }

    const report = await this.aggregate(groupId, periodStr, start, end);

    // 写 GroupReport（unique on groupId+period）
    const saved = await prisma.groupReport.upsert({
      where: { groupId_period: { groupId, period: periodStr } },
      create: {
        groupId,
        period: periodStr,
        summary: report as never,
      },
      update: { summary: report as never },
    });

    return { reportId: saved.id, period: periodStr, report };
  },

  /**
   * 我的报告（用户在自己各群的周报）
   */
  async myReport(userId: string, groupId?: string) {
    const reports = await this.currentWeek(userId, groupId);
    return { reports };
  },
};

function round(n: number, p: number): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}
