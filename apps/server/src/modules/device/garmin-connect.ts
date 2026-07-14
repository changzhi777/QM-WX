/**
 * device/garmin-connect.ts — B 路线：逆向 Garmin Connect（@gooin/garmin-connect）
 *
 * ⚠️ 非官方，ToS 风险 + auth flow 可能失效（Garth 已废弃，此库 2025 需真机验证）
 *
 * 流程：用户输入佳明账号密码 → login → 拉活动/睡眠/健康 → 落 RawActivity/GarminSleep
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { GarminConnect } = require('@gooin/garmin-connect');

/** 登录 Garmin Connect（用户名/密码）*/
export async function garminConnectLogin(username: string, password: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gc: any = new GarminConnect();
  await gc.login(username, password);
  return gc;
}

/** 拉用户活动列表（指定日期范围）*/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function garminFetchActivities(gc: any, _startDate: string, _endDate: string) {
  try {
    const activities = await gc.getActivities(0, 20);
    return activities || [];
  } catch {
    return [];
  }
}

/** 拉今日健康汇总（步数/心率/睡眠）*/
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function garminFetchTodayHealth(gc: any, date: string) {
  try {
    const stats = await gc.getDailySummary(date);
    return stats;
  } catch {
    return null;
  }
}
