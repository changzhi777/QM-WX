/**
 * interpret service — 资料解读（V0.2.33 阶段 1 MVP）
 *
 * 佳明 FIT 解析（fit-file-parser parseAsync，复用 importCorosFit 范式）
 *  → minimax M3 解读（Anthropic 兼容）→ 落 InterpretRecord
 *
 * 后续阶段扩展：garmin_zip / medical（图片 OCR+解读）/ screenshot
 */
import { randomUUID } from 'node:crypto';
import FitParser from 'fit-file-parser';
import { prisma } from '../../infra/prisma.js';
import { redis } from '../../infra/redis.js';
import { callMinimax, isMinimaxConfigured, callGlmVision, callGlm, isGlmVisionConfigured, type MinimaxMessage } from './client.js';
import { sportService } from '../sport/sport.service.js';
import { buildUserContext } from '../ai-coach/context-builder.js';
import { Errors } from '../../common/errors.js';

const GARMIN_SYSTEM_PROMPT = `你是青沐运动健康 AI 解读助手。根据用户上传的佳明运动数据，给出通俗、个性化、可执行的解读。
要求：
1. 数据概况（运动次数 / 总距离 / 总时长 / 平均配速 / 心率区间）
2. 训练负荷评估（循序渐进 / 过度 / 不足）
3. 2-3 条可执行建议（恢复 / 配速 / 加量调整）
4. 中文，500 字内，换行分段，避免空话套话`;

interface FitData {
  sessions?: Array<Record<string, unknown>>;
  records?: Array<Record<string, unknown>>;
}

/** 解析 FIT buffer → 运动摘要 JSON 文本（喂 minimax）*/
async function parseFitSummary(buffer: Buffer): Promise<string> {
  const parser = new FitParser({ force: true, mode: 'list' });
  let data: FitData;
  try {
    data = (await parser.parseAsync(buffer as unknown as ArrayBuffer)) as FitData;
  } catch (e) {
    throw new Error(`FIT 解析失败: ${(e as Error).message}`);
  }
  const sessions = data.sessions ?? [];
  const records = data.records ?? [];
  if (sessions.length === 0 && records.length === 0) {
    throw new Error('FIT 文件无有效运动数据');
  }
  const num = (x: unknown) => (typeof x === 'number' ? x : 0);
  const src = sessions.length ? sessions : records;
  const totalDistKm = Math.round((src.reduce((s, x) => s + num(x.total_distance ?? x.distance), 0) / 1000) * 100) / 100;
  const totalTimeMin = Math.round(src.reduce((s, x) => s + num(x.total_elapsed_time ?? x.total_timer_time ?? x.elapsed_time), 0) / 60);
  return JSON.stringify({
    count: src.length,
    totalDistanceKm: totalDistKm,
    totalTimeMin,
    samples: src.slice(-20).map((x) => ({
      distance: x.total_distance ?? x.distance,
      duration: x.total_elapsed_time ?? x.total_timer_time,
      avgHr: x.avg_heart_rate ?? x.average_heart_rate,
      avgSpeed: x.avg_speed ?? x.enhanced_avg_speed,
      timestamp: x.start_time ?? x.timestamp,
    })),
  });
}

/** 佳明 FIT 解读（解析 → minimax → 落表）*/
export async function interpretGarminFit(
  userId: string,
  input: { buffer: Buffer; inputKey: string },
): Promise<{ interpretation: string; recordId: string }> {
  if (!isMinimaxConfigured()) {
    throw new Error('MINIMAX_API_KEY 未配置');
  }
  const summary = await parseFitSummary(input.buffer);
  const messages: MinimaxMessage[] = [{ role: 'user', content: `佳明 FIT 数据：\n${summary}` }];
  const result = await callMinimax(GARMIN_SYSTEM_PROMPT, messages, { maxTokens: 1500 });
  const record = await prisma.interpretRecord.create({
    data: {
      userId,
      type: 'garmin_fit',
      inputKey: input.inputKey,
      result: result.content,
      model: result.model,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    },
  });
  return { interpretation: result.content, recordId: record.id };
}

// ===== V0.2.57 screenshot：GLM-4.6V 识图 → 入 checkin → 联动画像 → AI 综合分析 =====

const SCREENSHOT_EXTRACT_PROMPT = `你是运动健康数据识别助手。分析用户上传的截图，提取结构化数据。
只返回 JSON，字段：
- type: "run"|"ride"|"swim"|"walk"|"medical"|"other"（截图类型）
- distanceKm: number|null（距离 km，无则 null）
- durationSec: number|null（时长秒，无则 null）
- heartRate: number|null（心率 bpm，无则 null）
- paceSecPerKm: number|null（配速 秒/km，无则 null）
- calorie: number|null（卡路里，无则 null）
- metrics: [{"name":"指标名","value":"值"}]（其他关键指标，如步频/海拔/血压/血糖/睡眠分等）
- date: "YYYY-MM-DD"|null（截图里运动的日期，识别不出则 null）
- summary: 一句话描述截图内容
若非运动/健康数据，type="other"，数值字段 null，summary 描述截图实际内容。`;

const SCREENSHOT_ANALYSIS_PROMPT = `你是青沐 AI 健康分析助手。根据用户上传的截图识别数据 + 个人健康画像，给出综合性分析建议。
要求：
1. 截图数据解读（识别到的运动/健康指标含义，数值是否合理）
2. 联动个人数据分析（与跑量/心率/目标/跑鞋/天气/饮食等对比，指出趋势/异常/亮点）
3. 2-3 条可执行建议（恢复/调整/就医提示）
4. 涉及医学指标谨慎，建议就医而非诊断
5. 中文，600 字内，换行分段，避免空话套话`;

interface ScreenshotExtract {
  type: string;
  date: string | null;
  distanceKm: number | null;
  durationSec: number | null;
  heartRate: number | null;
  paceSecPerKm: number | null;
  calorie: number | null;
  metrics: Array<{ name: string; value: string }>;
  summary: string;
}

/** 格式化识别数据为文本（喂综合分析 prompt + 前端展示）*/
function formatExtract(e: ScreenshotExtract): string {
  const parts = [`类型: ${e.type}`, `摘要: ${e.summary}`];
  if (e.date) parts.push(`日期: ${e.date}`);
  if (e.distanceKm != null) parts.push(`距离: ${e.distanceKm}km`);
  if (e.durationSec != null) parts.push(`时长: ${Math.round(e.durationSec / 60)}min`);
  if (e.heartRate != null) parts.push(`心率: ${e.heartRate}bpm`);
  if (e.paceSecPerKm != null) {
    const m = Math.floor(e.paceSecPerKm / 60);
    const s = String(Math.round(e.paceSecPerKm % 60)).padStart(2, '0');
    parts.push(`配速: ${m}'${s}"/km`);
  }
  if (e.calorie != null) parts.push(`卡路里: ${e.calorie}kcal`);
  if (e.metrics.length) parts.push(`其他指标: ${e.metrics.map((m) => `${m.name}=${m.value}`).join('，')}`);
  return parts.join('\n');
}

/**
 * 截图解读（V0.2.60 重构：识图+分析，**不 auto checkin**；用户确认走 confirmScreenshotCheckin）
 * ① GLM-4.6V 识图 → 结构化数据（含 date）
 * ② 联动 buildUserContext 全量画像
 * ③ callGlm 文本综合分析（不传图，省 ~50% token；识图数据 + 画像足够）
 * ④ 落 InterpretRecord（extract 存表供确认查回，防前端篡改）
 * 返 extract 供前端展示 + 用户确认
 */
export async function interpretScreenshot(
  userId: string,
  input: { imageUrl: string; inputKey: string },
): Promise<{ interpretation: string; recordId: string; extract: ScreenshotExtract }> {
  if (!isGlmVisionConfigured()) {
    throw new Error('LLM_API_KEY 未配置');
  }

  // ① GLM-4.6V 识图 → 结构化数据（json_object）
  const extractRes = await callGlmVision(
    SCREENSHOT_EXTRACT_PROMPT,
    '请识别这张截图的运动/健康数据。',
    input.imageUrl,
    { maxTokens: 800, responseFormatJson: true },
  );
  let extract: ScreenshotExtract;
  try {
    extract = JSON.parse(extractRes.content) as ScreenshotExtract;
  } catch {
    // GLM 未返合法 JSON → 兜底 other，保留原始文本作 summary
    extract = {
      type: 'other',
      date: null,
      distanceKm: null,
      durationSec: null,
      heartRate: null,
      paceSecPerKm: null,
      calorie: null,
      metrics: [],
      summary: extractRes.content.slice(0, 100),
    };
  }

  // ② 联动个人全量画像（复用 ai-coach context-builder 13 路数据；查失败兜底不阻塞）
  const userProfile = await buildUserContext(userId).catch(() => '（画像数据暂不可用）');

  // ③ callGlm 文本综合分析（V0.2.60 改：不传图，省 token；识图数据 + 画像足够分析）
  const extractText = formatExtract(extract);
  const analysisRes = await callGlm(
    SCREENSHOT_ANALYSIS_PROMPT,
    `截图识别数据：\n${extractText}\n\n个人健康画像：\n${userProfile}`,
    { maxTokens: 1500 },
  );

  // ④ 落 InterpretRecord（extract 存表供 confirmScreenshotCheckin 查回，防前端篡改）
  const record = await prisma.interpretRecord.create({
    data: {
      userId,
      type: 'screenshot',
      inputKey: input.inputKey,
      result: analysisRes.content,
      model: analysisRes.model,
      inputTokens: extractRes.inputTokens + analysisRes.inputTokens,
      outputTokens: extractRes.outputTokens + analysisRes.outputTokens,
      extract: extract as never,
    },
  });

  return { interpretation: analysisRes.content, recordId: record.id, extract };
}

/**
 * 确认截图打卡（V0.2.60 P1.2：用户确认才入 checkin，防误识别污染跑量）
 * 查 record.extract → 去重（同 userId+date+distance+dataSource）→ checkin → 标 checkinConfirmedAt
 */
export async function confirmScreenshotCheckin(
  userId: string,
  input: { recordId: string },
): Promise<{ checkinCreated: boolean; reason?: string }> {
  const record = await prisma.interpretRecord.findUnique({ where: { id: input.recordId } });
  if (!record || record.userId !== userId) throw Errors.notFound('interpret record');
  if (record.type !== 'screenshot') throw Errors.badRequest('非截图记录，不可打卡');
  if (record.checkinConfirmedAt) return { checkinCreated: false, reason: '该截图已确认过打卡' };

  const extract = record.extract as ScreenshotExtract | null;
  if (!extract || extract.type === 'other') throw Errors.badRequest('未识别到可打卡的运动数据');
  const distKm = Number(extract.distanceKm);
  if (!Number.isFinite(distKm) || distKm <= 0) throw Errors.badRequest('识别的运动距离无效');

  const sportTypeMap: Record<string, 'run' | 'ride' | 'swim' | 'walk'> = {
    run: 'run',
    ride: 'ride',
    swim: 'swim',
    walk: 'walk',
  };
  const sportType = sportTypeMap[extract.type] ?? 'run';
  const date = extract.date ?? new Date().toISOString().slice(0, 10);

  // 去重：同 userId + date + distance + dataSource=sport_screenshot 已存在则拒（防同图重传/重复确认）
  const dup = await prisma.checkin.findFirst({
    where: { userId, date, distance: distKm, dataSource: 'sport_screenshot' },
  });
  if (dup) return { checkinCreated: false, reason: `${date} 已存在相同距离（${distKm}km）的截图打卡` };

  await sportService.checkin(userId, {
    distance: distKm,
    durationSec: extract.durationSec ?? undefined,
    dataSource: 'sport_screenshot',
    sportType,
  });
  await prisma.interpretRecord.update({
    where: { id: input.recordId },
    data: { checkinConfirmedAt: new Date() },
  });
  return { checkinCreated: true };
}

// ===== V0.2.63 H5 fallback：一次性 token + 历史解读 =====

const H5_TOKEN_TTL_SEC = 300; // 5min（非一次性，H5 内可多次调识图+确认）
const H5_KEY = (token: string) => `interpret:h5:${token}`;

/** 小程序生成 H5 跳转 token（Redis 5min TTL，关联 userId）*/
export async function issueH5Token(userId: string): Promise<{ token: string; url: string }> {
  const token = randomUUID();
  await redis.set(H5_KEY(token), userId, 'EX', H5_TOKEN_TTL_SEC);
  const base = process.env.H5_PUBLIC_BASE || 'https://qingmulife.cn';
  return { token, url: `${base}/h5/interpret.html?token=${token}` };
}

/** H5 验 token → userId（不删，TTL 内多次；过期/无效抛 401）*/
export async function verifyH5Token(token: string): Promise<string> {
  const userId = await redis.get(H5_KEY(token));
  if (!userId) throw Errors.unauthorized();
  return userId;
}

/** 小程序回看历史解读（type=screenshot，最新置顶）*/
export async function myInterpretHistory(
  userId: string,
  opts: { page?: number; pageSize?: number } = {},
) {
  const page = opts.page ?? 1;
  const pageSize = Math.min(opts.pageSize ?? 10, 50);
  const [list, total] = await Promise.all([
    prisma.interpretRecord.findMany({
      where: { userId, type: 'screenshot' },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, inputKey: true, result: true, extract: true, checkinConfirmedAt: true, createdAt: true },
    }),
    prisma.interpretRecord.count({ where: { userId, type: 'screenshot' } }),
  ]);
  const cdnBase = process.env.COS_CDN_DOMAIN || '';
  return {
    list: list.map((r) => ({
      ...r,
      imageUrl: cdnBase && r.inputKey ? `${cdnBase}/${r.inputKey}` : null,
      createdAt: r.createdAt.toISOString(),
      checkinConfirmedAt: r.checkinConfirmedAt ? r.checkinConfirmedAt.toISOString() : null,
    })),
    total,
    page,
    pageSize,
  };
}
