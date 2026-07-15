/**
 * stats module service — 跑者数据汇总（读模型）
 *
 * 数据来源：Checkin（含手动 manual + 佳明 garmin 导入）
 * 缓存：Cache.wrap 120s（汇总低频变化，失效靠 delByPattern）
 *
 * 参考：pic/2768 我的（跑者版）— 年跑量 / 总跑量 / 打卡次数 / 月跑量 / 平均配速
 */
import { prisma } from '../../infra/prisma.js';
import { Cache } from '../../infra/cache.js';
import { env } from '../../config/env.js';
import { publishDailyReport } from '../../infra/mqtt.js';
import type { MyRunnerStatsQuery, MyAnnualReportQuery, HealthScoreQuery, DailyReportQuery, DailyReportListQuery } from './stats.schema.js';

const RUNNER_STATS_CACHE_TTL_SEC = 120;

/** 平均配速：totalDurationSec / totalDistanceKm → mm:ss/km */
function calcAvgPace(totalDurationSec: number, totalDistanceKm: number): string | null {
  if (!totalDistanceKm || totalDistanceKm <= 0 || !totalDurationSec) return null;
  const secPerKm = Math.round(totalDurationSec / totalDistanceKm);
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** 跑量里程碑证书（V0.1.28，总跑量达标 → 动态生成） */
const MILESTONE_CERTS = [
  { km: 100, title: '初露锋芒', desc: '累计跑量突破 100 km' },
  { km: 500, title: '坚持不懈', desc: '累计跑量突破 500 km' },
  { km: 1000, title: '千里之行', desc: '累计跑量突破 1000 km' },
  { km: 3000, title: '马拉松健将', desc: '累计跑量突破 3000 km' },
] as const;

/** V0.1.135 连续打卡证书配置 */
const CONSECUTIVE_CERTS = [
  { days: 7, title: '周连击', desc: '连续打卡 7 天' },
  { days: 30, title: '月度坚持', desc: '连续打卡 30 天' },
  { days: 100, title: '百日筑基', desc: '连续打卡 100 天' },
] as const;

export const statsService = {
  /**
   * 跑者数据中心汇总（参考图 2768）
   *
   * 返回字段：
   * - yearDistance / yearCheckins：指定年（默认今年）
   * - monthDistance：指定月（默认本月）
   * - totalDistance / totalCheckins：全部历史
   * - avgPace：全部历史平均配速
   */
  async myRunnerStats(userId: string, input: MyRunnerStatsQuery) {
    const now = new Date();
    const year = input.year ?? now.getFullYear();
    const month = input.month ?? now.getMonth() + 1;
    const cacheKey = `stats:runner:${userId}:${year}:${month}`;

    return Cache.wrap(cacheKey, RUNNER_STATS_CACHE_TTL_SEC, async () => {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year + 1}-01-01`;
      const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
      const monthEnd =
        month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;

      const [yearAgg, monthAgg, totalAgg] = await Promise.all([
        prisma.checkin.aggregate({
          _sum: { distance: true, durationSec: true },
          _count: true,
          where: { userId, date: { gte: yearStart, lt: yearEnd } },
        }),
        prisma.checkin.aggregate({
          _sum: { distance: true },
          _count: true,
          where: { userId, date: { gte: monthStart, lt: monthEnd } },
        }),
        prisma.checkin.aggregate({
          _sum: { distance: true, durationSec: true },
          _count: true,
          where: { userId },
        }),
      ]);

      return {
        year,
        month,
        yearDistance: yearAgg._sum.distance ?? 0,
        yearCheckins: yearAgg._count,
        monthDistance: monthAgg._sum.distance ?? 0,
        monthCheckins: monthAgg._count,
        totalDistance: totalAgg._sum.distance ?? 0,
        totalCheckins: totalAgg._count,
        avgPace: calcAvgPace(totalAgg._sum.durationSec ?? 0, totalAgg._sum.distance ?? 0),
      };
    });
  },

  /**
   * 年度报告（V0.1.27，参考图 2768/2771 — 可分享战报）
   *
   * 返回：年汇总（yearDistance/Checkins/avgPace）+ 月度分布（12 个月）+ 最长单次 + 活跃天数
   * 数据来源：Checkin（manual + garmin 导入）
   * 缓存：Cache.wrap 120s（年度数据低频变化）
   *
   * 性能：用单次 groupBy(by date) 拿全年每日数据，前端 reduce 成月度（避免 12 次 aggregate）
   */
  async myAnnualReport(userId: string, input: MyAnnualReportQuery) {
    const now = new Date();
    const year = input.year ?? now.getFullYear();
    const cacheKey = `stats:annual:${userId}:${year}`;

    return Cache.wrap(cacheKey, RUNNER_STATS_CACHE_TTL_SEC, async () => {
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year + 1}-01-01`;

      const [yearAgg, longestRun, daily] = await Promise.all([
        prisma.checkin.aggregate({
          _sum: { distance: true, durationSec: true },
          _count: true,
          where: { userId, date: { gte: yearStart, lt: yearEnd } },
        }),
        prisma.checkin.findFirst({
          where: { userId, date: { gte: yearStart, lt: yearEnd } },
          orderBy: { distance: 'desc' },
          select: { distance: true, date: true },
        }),
        prisma.checkin.groupBy({
          by: ['date'],
          _sum: { distance: true },
          _count: true,
          where: { userId, date: { gte: yearStart, lt: yearEnd } },
        }),
      ]);

      // 月度聚合（按 date 字符串切片月份，避免 12 次查询）
      const round1 = (n: number) => Math.round(n * 10) / 10;
      const monthly = Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        distance: 0,
        count: 0,
      }));
      for (const d of daily) {
        const m = Number(d.date.slice(5, 7)); // "YYYY-MM-DD" → MM
        if (m >= 1 && m <= 12) {
          monthly[m - 1].distance += d._sum.distance ?? 0;
          monthly[m - 1].count += d._count;
        }
      }

      return {
        year,
        yearDistance: round1(yearAgg._sum.distance ?? 0),
        yearCheckins: yearAgg._count,
        yearDurationSec: yearAgg._sum.durationSec ?? 0,
        avgPace: calcAvgPace(yearAgg._sum.durationSec ?? 0, yearAgg._sum.distance ?? 0),
        monthly: monthly.map((m) => ({ ...m, distance: round1(m.distance) })),
        longestRun: longestRun ? { distance: round1(longestRun.distance), date: longestRun.date } : null,
        activeDays: daily.length,
      };
    });
  },

  /**
   * 我的证书（V0.1.28，动态生成 — 不建表）
   *
   * 两类：
   * - 里程碑证书：总跑量达标 100/500/1000/3000 km（基于 Checkin aggregate）
   * - 赛事证书：已报名的马拉松（Enrollment type=marathon + Content）
   *
   * 缓存：Cache.wrap 120s
   */
  async myCertificates(userId: string) {
    const cacheKey = `stats:certs:${userId}`;
    return Cache.wrap(cacheKey, RUNNER_STATS_CACHE_TTL_SEC, async () => {
      const [totalAgg, enrollments] = await Promise.all([
        prisma.checkin.aggregate({
          _sum: { distance: true },
          _count: true,
          where: { userId },
        }),
        prisma.enrollment.findMany({
          where: { userId, type: 'marathon', status: { in: ['submitted', 'confirmed'] } },
          include: {
            content: { select: { title: true, date: true, location: true, cover: true } },
          },
        }),
      ]);

      const totalDistance = totalAgg._sum.distance ?? 0;
      const round1 = (n: number) => Math.round(n * 10) / 10;

      // 里程碑证书（达标的）
      const milestones = MILESTONE_CERTS.filter((m) => totalDistance >= m.km).map((m) => ({
        ...m,
        type: 'milestone' as const,
        currentKm: round1(totalDistance),
      }));

      // 赛事证书（已报名马拉松）
      const marathons = enrollments
        .filter((e) => e.content)
        .map((e) => ({
          type: 'marathon' as const,
          enrollmentId: e.id,
          contentId: e.contentId,
          title: e.content.title,
          date: e.content.date,
          location: e.content.location,
          cover: e.content.cover,
          status: e.status,
        }));

      return {
        totalDistance: round1(totalDistance),
        totalCheckins: totalAgg._count,
        milestones,
        marathons,
        nextMilestone: MILESTONE_CERTS.find((m) => totalDistance < m.km) ?? null,
        // V0.1.135 多种证书
        paceProgressCert: await computePaceProgressCert(userId),
        consecutiveCheckinCert: await computeConsecutiveCheckinCert(userId),
        groupContributionCert: await computeGroupContributionCert(userId),
        // V0.1.137 跑鞋成就
        shoesMilestonesCert: await computeShoesMilestonesCert(userId),
        shoeDaysMilestonesCert: await computeShoeDaysMilestonesCert(userId),
        shoeCheckinMilestonesCert: await computeShoeCheckinMilestonesCert(userId),
      };
    });
  },

  // ===== V0.1.144 原型图"今日"tab：健康分数 + AI 简报 + 历史 =====

  /** 健康分数（0-100，步数40%+心率30%+睡眠30%）+ 趋势对比（vs 昨日）*/
  async healthScore(userId: string, input: HealthScoreQuery) {
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    const today = input.date ?? cnDate(now);
    const yesterday = cnDate(new Date(now.getTime() - 86400 * 1000));
    const [todaySteps, todayHr, todaySleep, ySteps, yHr, ySleep] = await Promise.all([
      getTodaySteps(userId, today), getRestingHr(userId, today), getLastNightSleep(userId, today),
      getTodaySteps(userId, yesterday), getRestingHr(userId, yesterday), getLastNightSleep(userId, yesterday),
    ]);
    const score = calcHealthScore(todaySteps, todayHr, todaySleep);
    const yScore = calcHealthScore(ySteps, yHr, ySleep);
    return {
      date: today,
      score,
      steps: todaySteps,
      restingHr: todayHr,
      sleepHours: todaySleep,
      trend: { yesterday: yScore, diff: score - yScore },
    };
  },

  /** 每日 AI 简报（无则聚合数据+算分+生成文本+存表+MQTT 推；有则返缓存）*/
  async dailyReport(userId: string, input: DailyReportQuery) {
    const now = new Date(Date.now() + 8 * 3600 * 1000);
    const date = input.date ?? cnDate(now);
    const existing = await prisma.dailyReport.findUnique({ where: { userId_date: { userId, date } } });
    if (existing) return existing;
    const [steps, restingHr, sleepHours] = await Promise.all([
      getTodaySteps(userId, date), getRestingHr(userId, date), getLastNightSleep(userId, date),
    ]);
    const healthScore = calcHealthScore(steps, restingHr, sleepHours);
    const reportText = buildReportText(steps, restingHr, sleepHours, healthScore);
    const alertText = buildAlertText(steps, restingHr, sleepHours);
    const report = await prisma.dailyReport.create({
      data: { userId, date, healthScore, reportText, alertText, steps, restingHr, sleepHours },
    });
    // MQTT publish（异步推前端，不阻塞返回；未配置 MQTT 则跳过，前端走 API 兜底）
    publishDailyReport(userId, report).catch(() => {});
    return report;
  },

  /** 历史 AI 报告列表（原型图"历史AI报告"）*/
  async dailyReportList(userId: string, input: DailyReportListQuery) {
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 20;
    const [list, total] = await Promise.all([
      prisma.dailyReport.findMany({
        where: { userId },
        orderBy: { date: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.dailyReport.count({ where: { userId } }),
    ]);
    return { list, total, page, pageSize, hasMore: page * pageSize < total };
  },

  /** V0.1.148 真天气（和风 API + 逆地理）；无 key 或失败走 stub */
  async weather(userId: string, input?: { lat?: number; lon?: number }) {
    void userId;
    const key = env.QWEATHER_KEY;
    const lat = input?.lat ?? 28.23;
    const lon = input?.lon ?? 112.94;
    const location = `${lon.toFixed(2)},${lat.toFixed(2)}`;
    if (!key) {
      // 默认经纬度 28.23N, 112.94E → 长沙（实际地理坐标，非「杭州」历史 bug 修复）
      return { city: '长沙', text: '晴', temperature: 25, feelsLike: 26, humidity: 60, icon: '999', updatedAt: new Date().toISOString() };
    }
    try {
      const apiHost = env.QWEATHER_API_HOST;
      const headers = { 'X-QW-Api-Key': key };
      const [cityRes, weatherRes] = await Promise.all([
        fetch(`https://${apiHost}/geo/v2/city/lookup?location=${location}`, { headers }),
        fetch(`https://${apiHost}/v7/weather/now?location=${location}`, { headers }),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cityData = await cityRes.json() as any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const weatherData = await weatherRes.json() as any;
      const city = cityData?.location?.[0]?.adm2 ?? cityData?.location?.[0]?.name ?? '未知';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const now = (weatherData?.now ?? {}) as any;
      return {
        city,
        text: now.text ?? '未知',
        temperature: parseInt(now.temp ?? '25'),
        feelsLike: parseInt(now.feelsLike ?? '26'),
        humidity: parseInt(now.humidity ?? '60'),
        icon: now.icon ?? '999',
        updatedAt: new Date().toISOString(),
      };
    } catch {
      return { city: '未知', text: '获取失败', temperature: 0, feelsLike: 0, humidity: 0, icon: '999', updatedAt: new Date().toISOString() };
    }
  },

  // V0.2.0 关联分析：温度×配速 / 湿度×心率（Pearson + 最小样本阈值）
  // 缓存 120s（与 myRunnerStats/myAnnualReport 一致 — 检查 weatherAnalysis 即可；打卡/天气数据变化后 2 分钟生效）
  async weatherAnalysis(userId: string) {
    const cacheKey = `stats:weatherAnalysis:${userId}`;
    return Cache.wrap(cacheKey, RUNNER_STATS_CACHE_TTL_SEC, async () => {
      return this.computeWeatherAnalysis(userId);
    });
  },
  async computeWeatherAnalysis(userId: string) {
    const checkins = await prisma.checkin.findMany({
      where: { userId, weatherTemp: { not: null } },
      select: { weatherTemp: true, humidity: true, pace: true, heartRate: true },
      take: 200,
      orderBy: { createdAt: 'desc' },
    });
    if (checkins.length < 10) {
      return { sufficient: false, message: `数据积累中（${checkins.length}/10 条带天气打卡）`, count: checkins.length };
    }
    const tempPace = checkins.filter((c) => c.pace).map((c) => ({ x: c.weatherTemp!, y: parsePaceSec(c.pace!) }));
    const humidityHr = checkins.filter((c) => c.humidity != null && c.heartRate != null).map((c) => ({ x: c.humidity!, y: c.heartRate! }));
    const tempPaceR = pearson(tempPace);
    const humidityHrR = humidityHr.length >= 10 ? pearson(humidityHr) : null;
    const insights: string[] = [];
    if (tempPaceR != null && Math.abs(tempPaceR) >= 0.3) {
      insights.push(tempPaceR > 0 ? `温度升高配速变慢（相关 ${tempPaceR.toFixed(2)}），高温天建议改晨跑` : `温度升高配速反而快（相关 ${tempPaceR.toFixed(2)}），你更耐热`);
    }
    if (humidityHrR != null && humidityHrR >= 0.3) {
      insights.push(`湿度升高运动心率偏高（相关 ${humidityHrR.toFixed(2)}），湿热天注意补水降强`);
    }
    if (insights.length === 0) insights.push('暂未发现显著天气-表现关联（样本波动大）');
    return {
      sufficient: true,
      count: checkins.length,
      insights,
      correlations: { tempPace: tempPaceR, humidityHr: humidityHrR },
      scatter: { tempPace: tempPace.slice(0, 50), humidityHr: humidityHr.slice(0, 50) },
    };
  },

  // V0.2.0 用户画像（聚合基础/运动/健康 → tags + summary，供 AI 千人千面策略）
  // 缓存 120s（基础信息变化频次低，2 分钟内重读同一 user 返缓存）
  async userProfile(userId: string) {
    const cacheKey = `stats:userProfile:${userId}`;
    return Cache.wrap(cacheKey, RUNNER_STATS_CACHE_TTL_SEC, async () => {
      return this.computeUserProfile(userId);
    });
  },
  async computeUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { gender: true, birthday: true, height: true, weight: true, region: true, memberLevel: true },
    });
    const checkinAgg = await prisma.checkin.aggregate({
      where: { userId },
      _sum: { distance: true },
      _count: true,
      _avg: { heartRate: true },
    });
    const latestBody = await prisma.bodyCompositionRecord.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const age = user?.birthday ? Math.floor((Date.now() - new Date(user.birthday).getTime()) / (365.25 * 86400000)) : null;
    const heightM = user?.height ? user.height / 100 : null;
    const bmi = heightM && user?.weight ? user.weight / heightM ** 2 : latestBody?.bmi ?? null;
    const total = checkinAgg._sum.distance ?? 0;
    const tags: string[] = [];
    if (bmi != null) tags.push(bmi < 18.5 ? '偏瘦' : bmi < 24 ? '正常体型' : bmi < 28 ? '偏胖' : '肥胖');
    tags.push(total > 1000 ? '资深跑者' : total > 200 ? '进阶跑者' : total > 0 ? '入门跑者' : '运动新手');
    return {
      basic: { gender: user?.gender, age, height: user?.height, weight: user?.weight, bmi: bmi ? Number(bmi.toFixed(1)) : null, region: user?.region, memberLevel: user?.memberLevel },
      sport: { totalDistance: Number(total.toFixed(1)), checkinCount: checkinAgg._count, avgHeartRate: checkinAgg._avg.heartRate ? Math.round(checkinAgg._avg.heartRate) : null },
      body: latestBody ? { bodyFat: latestBody.bodyFat, muscle: latestBody.muscle, visceralFat: latestBody.visceralFat } : null,
      tags,
      summary: `${age ?? '?'}岁${user?.gender === 'male' ? '男' : user?.gender === 'female' ? '女' : ''}，BMI ${bmi?.toFixed(1) ?? '?'}（${tags[0] ?? ''}），累计跑量 ${total.toFixed(0)}km（${tags[1] ?? ''}）`,
    };
  },
};

// V0.2.0 关联分析 helpers（模块级）
function parsePaceSec(pace: string): number {
  const [m, s] = pace.split(':').map(Number);
  return (m || 0) * 60 + (s || 0);
}
function pearson(pairs: { x: number; y: number }[]): number | null {
  const n = pairs.length;
  if (n < 2) return null;
  const mx = pairs.reduce((a, p) => a + p.x, 0) / n;
  const my = pairs.reduce((a, p) => a + p.y, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (const p of pairs) { num += (p.x - mx) * (p.y - my); dx += (p.x - mx) ** 2; dy += (p.y - my) ** 2; }
  const den = Math.sqrt(dx * dy);
  return den === 0 ? null : num / den;
}

// ============================================================
// V0.1.144 健康分数 + AI 简报 helper
// ============================================================

/** CN 时区日期 → YYYY-MM-DD */
function cnDate(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

/** 今日步数（WeRunRecord）*/
async function getTodaySteps(userId: string, date: string): Promise<number> {
  const r = await prisma.weRunRecord.findUnique({ where: { userId_date: { userId, date } } });
  return r?.step ?? 0;
}

/** 静息心率（今日最早心率近似）*/
async function getRestingHr(userId: string, date: string): Promise<number | null> {
  const start = `${date}T00:00:00Z`;
  const end = `${date}T23:59:59Z`;
  const r = await prisma.heartRateRecord.findFirst({
    where: { userId, timestamp: { gte: start, lte: end } },
    orderBy: { timestamp: 'asc' },
  });
  return r?.value ?? null;
}

/** 昨晚睡眠时长（SleepRecord 前一天 durationSeconds / 3600）*/
async function getLastNightSleep(userId: string, date: string): Promise<number | null> {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  const yDate = cnDate(d);
  const r = await prisma.sleepRecord.findUnique({ where: { userId_date: { userId, date: yDate } } });
  if (!r?.durationSeconds) return null;
  return Math.round((r.durationSeconds / 3600) * 10) / 10;
}

/** 健康分数：步数达标率×40 + 心率正常率×30 + 睡眠达标率×30（无数据给半分）*/
function calcHealthScore(steps: number, restingHr: number | null, sleepHours: number | null): number {
  const stepScore = Math.min(steps / 8000, 1) * 40;
  const hrScore = restingHr != null
    ? (restingHr >= 60 && restingHr <= 80 ? 1 : restingHr < 60 ? Math.max(0, restingHr / 60) : Math.max(0, 1 - (restingHr - 80) / 40)) * 30
    : 15;
  const sleepScore = sleepHours != null ? Math.min(sleepHours / 7, 1) * 30 : 15;
  return Math.round(stepScore + hrScore + sleepScore);
}

/** 简报文本（规则模板，基于数据 + 分数）*/
function buildReportText(steps: number, hr: number | null, sleep: number | null, score: number): string {
  const parts: string[] = [`今日健康分数 ${score} 分`, `步数 ${steps.toLocaleString()} 步${steps < 8000 ? '，低于目标' : '，达标'}`];
  if (hr != null) parts.push(`静息心率 ${hr} bpm${hr >= 60 && hr <= 80 ? '，良好' : hr > 80 ? '，偏高' : '，偏低'}`);
  if (sleep != null) parts.push(`昨晚睡眠 ${sleep} 小时${sleep < 7 ? '，不足' : '，充足'}`);
  if (steps < 8000) parts.push('建议增加日常活动');
  if (sleep != null && sleep < 6) parts.push('建议今晚早睡');
  return parts.join('。');
}

/** 主动提醒（睡眠不足/心率异常/步数过低）*/
function buildAlertText(steps: number, hr: number | null, sleep: number | null): string | null {
  if (sleep != null && sleep < 6) return `昨晚睡眠仅 ${sleep} 小时，建议避免高强度运动，以拉伸+散步为主`;
  if (hr != null && hr > 90) return `静息心率 ${hr} bpm 偏高，建议今日低强度运动`;
  if (steps < 3000) return `今日步数仅 ${steps} 步，建议增加活动量`;
  return null;
}

// ============================================================
// V0.1.135 多种证书 helper（动态生成，沿用 MILESTONE_CERTS 范式）
// ============================================================

/**
 * 配速进步证书：最近 5 次跑均快于历史均值 10%
 *
 * 算法：取用户最近 10 次有配速的 Checkin → 后 5 次平均 vs 前 5 次平均
 * 简化：MVP 不区分训练强度，按距离+时间算 pace (sec/km)
 */
async function computePaceProgressCert(userId: string) {
  const checkins = await prisma.checkin.findMany({
    where: { userId, distance: { gt: 0 }, durationSec: { gt: 0 } },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { distance: true, durationSec: true },
  });
  if (checkins.length < 10) {
    return { type: 'pace_progress' as const, achieved: false, reason: 'need_10_runs' };
  }

  // 前 5 次（基线）vs 后 5 次（最新） — 数组按 desc，所以 [0..4]=最新5次, [5..9]=之前5次
  const recent5 = checkins.slice(0, 5);
  const baseline5 = checkins.slice(5, 10);

  const pace = (c: { distance: number; durationSec: number | null }) =>
    c.distance > 0 && c.durationSec ? c.durationSec / c.distance : Infinity;

  const recentAvg = recent5.reduce((s, c) => s + pace(c), 0) / 5;
  const baselineAvg = baseline5.reduce((s, c) => s + pace(c), 0) / 5;

  // 提速 10% → recent pace < baseline * 0.9
  const achieved = recentAvg < baselineAvg * 0.9;

  return {
    type: 'pace_progress' as const,
    title: '配速进步',
    desc: '最近 5 次跑进历史均值 10%',
    achieved,
    currentPace: Math.round(recentAvg),
    baselinePace: Math.round(baselineAvg),
    improvementPct: baselineAvg > 0 ? Math.round((1 - recentAvg / baselineAvg) * 100) : 0,
  };
}

/**
 * 连续打卡证书：当前/历史最长连续打卡天数
 *
 * 算法：按 date asc 找最长 streak（跨日期连续）
 */
async function computeConsecutiveCheckinCert(userId: string) {
  const checkins = await prisma.checkin.findMany({
    where: { userId },
    orderBy: { date: 'asc' },
    select: { date: true },
  });
  if (checkins.length === 0) {
    return {
      type: 'consecutive_checkin' as const,
      currentStreak: 0,
      longestStreak: 0,
      achieved: [] as Array<typeof CONSECUTIVE_CERTS[number]>,
    };
  }

  // 去重 date
  const uniqueDates = Array.from(new Set(checkins.map((c) => c.date))).sort();

  // 计算当前 streak（从最后一天往前数）
  let currentStreak = 1;
  for (let i = uniqueDates.length - 1; i > 0; i--) {
    const d1 = new Date(uniqueDates[i]);
    const d2 = new Date(uniqueDates[i - 1]);
    const diffDays = Math.round((d1.getTime() - d2.getTime()) / 86400000);
    if (diffDays === 1) currentStreak++;
    else break;
  }

  // 计算最长 streak（遍历整个序列）
  let longestStreak = 1;
  let cur = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const d1 = new Date(uniqueDates[i - 1]);
    const d2 = new Date(uniqueDates[i]);
    const diffDays = Math.round((d2.getTime() - d1.getTime()) / 86400000);
    if (diffDays === 1) cur++;
    else cur = 1;
    longestStreak = Math.max(longestStreak, cur);
  }

  // 达成的证书
  const achieved = CONSECUTIVE_CERTS.filter((c) => longestStreak >= c.days);

  return {
    type: 'consecutive_checkin' as const,
    title: '连续打卡',
    currentStreak,
    longestStreak,
    achieved,
  };
}

/**
 * 群内贡献证书：用户在跑群本月跑量前 3
 */
async function computeGroupContributionCert(userId: string) {
  const memberOf = await prisma.groupMember.findMany({
    where: { userId },
    select: { groupId: true },
  });
  if (memberOf.length === 0) {
    return { type: 'group_contribution' as const, achieved: false, topRanks: [] };
  }

  const groupIds = memberOf.map((m) => m.groupId);

  // 本月 CN 时区范围
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 8 * 3600 * 1000)
    .toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 8 * 3600 * 1000)
    .toISOString().slice(0, 10);

  const topRanks: Array<{ groupId: string; groupName: string; rank: number }> = [];

  // 对每个 group 聚合本月跑量 → 找用户排名
  for (const groupId of groupIds) {
    const group = await prisma.group.findUnique({ where: { id: groupId }, select: { name: true } });
    if (!group) continue;

    const memberIds = await prisma.groupMember.findMany({
      where: { groupId },
      select: { userId: true },
    });
    const uIds = memberIds.map((m) => m.userId);

    const monthAgg = await prisma.checkin.groupBy({
      by: ['userId'],
      where: {
        userId: { in: uIds },
        date: { gte: monthStart, lt: monthEnd },
      },
      _sum: { distance: true },
      orderBy: { _sum: { distance: 'desc' } },
    });

    const idx = monthAgg.findIndex((r) => r.userId === userId);
    if (idx >= 0 && idx < 3) {
      topRanks.push({ groupId, groupName: group.name, rank: idx + 1 });
    }
  }

  return {
    type: 'group_contribution' as const,
    title: '群内前 3',
    desc: '本月跑量在跑群内前 3 名',
    achieved: topRanks.length > 0,
    topRanks,
  };
}

/**
 * V0.1.137 跑鞋累计里程里程碑
 * active + retired 全部鞋的 currentKm 之和
 */
async function computeShoesMilestonesCert(userId: string) {
  const CERTS = [
    { km: 100, title: '百公里新手', icon: '🏃' },
    { km: 500, title: '五百公里健将', icon: '👟' },
    { km: 1000, title: '千里跑神', icon: '🏆' },
    { km: 3000, title: '鞋履收藏家', icon: '👑' },
  ];
  const agg = await prisma.shoe.aggregate({
    _sum: { currentKm: true },
    where: { userId },
  });
  const total = Math.round((agg._sum.currentKm ?? 0) * 10) / 10;
  return {
    type: 'shoes_milestones' as const,
    title: '跑鞋累计里程',
    desc: '所有跑鞋累计里程达成',
    currentTotalKm: total,
    achieved: CERTS.filter((c) => total >= c.km).map((c) => ({ ...c, achievedKm: total })),
    next: CERTS.find((c) => total < c.km) ?? null,
  };
}

/**
 * V0.1.137 跑鞋持有天数里程碑
 * 最早 shoe.purchasedAt 到现在的天数
 */
async function computeShoeDaysMilestonesCert(userId: string) {
  const CERTS = [
    { days: 30, title: '月度装备者', icon: '📅' },
    { days: 100, title: '百日陪伴', icon: '🗓️' },
    { days: 365, title: '年度老友', icon: '🎖️' },
  ];
  const oldest = await prisma.shoe.findFirst({
    where: { userId, purchasedAt: { not: null } },
    orderBy: { purchasedAt: 'asc' },
    select: { purchasedAt: true },
  });
  if (!oldest?.purchasedAt) {
    return {
      type: 'shoe_days' as const,
      title: '跑鞋持有天数',
      currentTotalDays: 0,
      achieved: [],
      next: CERTS[0],
    };
  }
  const totalDays = Math.floor((Date.now() - oldest.purchasedAt.getTime()) / 86400000);
  return {
    type: 'shoe_days' as const,
    title: '跑鞋持有天数',
    currentTotalDays: totalDays,
    achieved: CERTS.filter((c) => totalDays >= c.days).map((c) => ({ ...c, achievedDays: totalDays })),
    next: CERTS.find((c) => totalDays < c.days) ?? null,
  };
}

/**
 * V0.1.137 跑鞋关联打卡次数里程碑
 * Checkin where shoeId IS NOT NULL + userId
 */
async function computeShoeCheckinMilestonesCert(userId: string) {
  const CERTS = [
    { count: 50, title: '半百打卡', icon: '🎯' },
    { count: 100, title: '百次荣耀', icon: '💯' },
    { count: 500, title: '五百次传说', icon: '🏅' },
  ];
  const total = await prisma.checkin.count({
    where: { userId, shoeId: { not: null } },
  });
  return {
    type: 'shoe_checkin' as const,
    title: '跑鞋打卡次数',
    currentTotalCheckins: total,
    achieved: CERTS.filter((c) => total >= c.count).map((c) => ({ ...c, achievedCount: total })),
    next: CERTS.find((c) => total < c.count) ?? null,
  };
}
