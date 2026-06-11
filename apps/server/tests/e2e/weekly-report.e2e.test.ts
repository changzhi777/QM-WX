/**
 * weekly-report 端到端测试
 *
 * 用真 PG/Redis（由 docker 起），不 mock：
 * 1. 准备：建测试 user + group + 3 条 checkin
 * 2. 调 processWeeklyReport({groupId, period})
 * 3. 验：GroupReport row 落库，summary 含正确 topMembers
 * 4. 清理：删所有测试数据
 *
 * 跑法：`RUN_E2E=1 pnpm test`
 * 跳过：默认不跑（避免污染单测）
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { prisma } from '../../src/infra/prisma.js';
import { processWeeklyReport } from '../../src/jobs/weekly-report.job.js';

const skip = !process.env.RUN_E2E;
const itE2E = skip ? it.skip : it;

const TEST_USER_ID = 'e2e-user-1';
const TEST_GROUP_ID = 'e2e-group-1';
void TEST_USER_ID; // 保留以备扩展

describe.skipIf(skip)('processWeeklyReport（真 DB）', () => {
  beforeAll(async () => {
    // 准备：先建 user（外键约束），再建 group + member
    for (let i = 0; i < 3; i++) {
      await prisma.user.upsert({
        where: { id: `e2e-user-${i + 1}` },
        create: {
          id: `e2e-user-${i + 1}`,
          openid: `e2e-openid-${i + 1}`,
          nickname: `Runner ${i + 1}`,
        },
        update: {},
      });
    }

    // 建 group
    await prisma.group.upsert({
      where: { id: TEST_GROUP_ID },
      create: {
        id: TEST_GROUP_ID,
        name: 'E2E Test Group',
        ownerId: 'e2e-user-1',
        memberCount: 3,
      },
      update: {},
    });

    // 建 3 个 member
    for (let i = 0; i < 3; i++) {
      await prisma.groupMember.upsert({
        where: { groupId_userId: { groupId: TEST_GROUP_ID, userId: `e2e-user-${i + 1}` } },
        create: {
          groupId: TEST_GROUP_ID,
          userId: `e2e-user-${i + 1}`,
          nickname: `Runner ${i + 1}`,
          role: i === 0 ? 'owner' : 'member',
        },
        update: {},
      });
    }

    // 删旧的 checkin + GroupReport
    await prisma.checkin.deleteMany({ where: { groupId: TEST_GROUP_ID } });
    await prisma.groupReport.deleteMany({ where: { groupId: TEST_GROUP_ID } });

    // 插 3 条 checkin
    const today = new Date().toISOString().slice(0, 10);
    await prisma.checkin.createMany({
      data: [
        { userId: 'e2e-user-1', groupId: TEST_GROUP_ID, distance: 15, points: 15, date: today },
        { userId: 'e2e-user-2', groupId: TEST_GROUP_ID, distance: 10, points: 10, date: today },
        { userId: 'e2e-user-3', groupId: TEST_GROUP_ID, distance: 5, points: 5, date: today },
      ],
    });
  });

  afterAll(async () => {
    // 清理
    await prisma.checkin.deleteMany({ where: { groupId: TEST_GROUP_ID } });
    await prisma.groupReport.deleteMany({ where: { groupId: TEST_GROUP_ID } });
    await prisma.groupMember.deleteMany({ where: { groupId: TEST_GROUP_ID } });
    await prisma.group.delete({ where: { id: TEST_GROUP_ID } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { startsWith: 'e2e-user-' } } });
    await prisma.$disconnect();
  });

  itE2E('单群周报：写入 GroupReport，冠军=15km 用户', async () => {
    const period = new Date().toISOString().slice(0, 10); // 用今天日期当 period 占位
    const result = await processWeeklyReport({ groupId: TEST_GROUP_ID, period });

    expect(result.ok).toBe(true);

    const saved = await prisma.groupReport.findUnique({
      where: { groupId_period: { groupId: TEST_GROUP_ID, period } },
    });
    expect(saved).not.toBeNull();
    const summary = saved!.summary as { champion: { userId: string; distance: number }; topMembers: { userId: string; distance: number }[] };
    expect(summary.champion.userId).toBe('e2e-user-1');
    expect(summary.champion.distance).toBe(15);
    expect(summary.topMembers).toHaveLength(3);
  });

  itE2E('重跑同 period：upsert 不重复', async () => {
    const period = '2026-W24';
    await processWeeklyReport({ groupId: TEST_GROUP_ID, period });
    await processWeeklyReport({ groupId: TEST_GROUP_ID, period });

    const count = await prisma.groupReport.count({
      where: { groupId: TEST_GROUP_ID, period },
    });
    expect(count).toBe(1);
  });
});
