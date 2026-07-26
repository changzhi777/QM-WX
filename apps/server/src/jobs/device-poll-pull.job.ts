/**
 * jobs/device-poll-pull.job.ts — 设备数据主动拉取 worker（V0.2.152 skeleton）
 *
 * 触发:BullMQ repeatable(每 24 小时)+ 启动预热一次
 * 目的:替代 Mosquitto broker — cron 主动拉 device data 落 DeviceDailyActivity
 *
 * 当前状态:SKELETON（不接真实数据源）— V0.3.1 拍板数据源后实施：
 *   路径 A:微信运动通道（V0.2.113 syncWeRun 已实装，需 user session_key 解密 → cron 不可解密）
 *   路径 B:Terra HTTPS API 拉数据（需 Terra 签约）
 *   路径 C:EMQX broker 接 device publish
 *   路径 D:cron 调各 vendor OAuth API（Garmin/华为/小米）
 *
 * 当前实现:仅清点活跃用户数（无副作用），1 测试，cron 24h 跑 + 启动预热
 *
 * 详见 V0.2.152 commit + memory mosquitto-5x-debug-root-cause.md
 */
import { prisma } from '../infra/prisma.js';
import { logger } from '../common/logger.js';

export interface DevicePollPullJobData {}

export interface DevicePollPullResult {
  activeUserCount: number;
  pulledUserCount: number;
  failedUserCount: number;
  // TODO V0.3.1: deviceDataRecords + errorDetails
}

export async function processDevicePollPull(): Promise<DevicePollPullResult> {
  // 1. 清点最近 7 天活跃用户（有 Checkin / StrengthSession / WeRunRecord 的用户）
  const since = new Date(Date.now() - 7 * 86_400_000);
  const activeUsers = await prisma.user.findMany({
    where: {
      OR: [
        { checkins: { some: { createdAt: { gte: since } } } },
        { strengthSessions: { some: { createdAt: { gte: since } } } },
        { weRunRecords: { some: { createdAt: { gte: since } } } },
      ],
    },
    select: { id: true },
    take: 1000, // 上限防滥用（每轮最多 1000 用户）
  });

  // 2. TODO V0.3.1: 拉每个用户的 device data → 调 deviceService.recordDeviceDailyActivity
  // const { deviceService } = await import('../modules/device/device.service.js');
  // for (const u of activeUsers) {
  //   try {
  //     // 例如：const data = await fetchTerraData(u.id);  // 或 syncWeRun / Garmin OAuth
  //     // await deviceService.recordDeviceDailyActivity(u.id, data);
  //   } catch (e) {
  //     failedUserCount++;
  //   }
  // }

  const result: DevicePollPullResult = {
    activeUserCount: activeUsers.length,
    pulledUserCount: 0, // TODO V0.3.1
    failedUserCount: 0,
  };

  logger.info(result, 'device-poll-pull tick done (skeleton, data source TBD V0.3.1)');
  return result;
}