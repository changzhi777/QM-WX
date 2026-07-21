/**
 * interpret service — 资料解读（V0.2.33 阶段 1 MVP）
 *
 * 佳明 FIT 解析（fit-file-parser parseAsync，复用 importCorosFit 范式）
 *  → minimax M3 解读（Anthropic 兼容）→ 落 InterpretRecord
 *
 * 后续阶段扩展：garmin_zip / medical（图片 OCR+解读）/ screenshot
 */
import FitParser from 'fit-file-parser';
import { prisma } from '../../infra/prisma.js';
import { callMinimax, isMinimaxConfigured, callGlmVision, isGlmVisionConfigured, type MinimaxMessage } from './client.js';
import { sportService } from '../sport/sport.service.js';
import { buildUserContext } from '../ai-coach/context-builder.js';

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
  distanceKm: number | null;
  durationSec: number | null;
  heartRate: number | null;
  paceSecPerKm: number | null;
  calorie: number | null;
  metrics: Array<{ name: string; value: string }>;
  summary: string;
}

/** 格式化识别数据为文本（喂综合分析 prompt + 前端展示）*/
function formatExtract(e: ScreenshotExtract, checkinCreated: boolean): string {
  const parts = [`类型: ${e.type}`, `摘要: ${e.summary}`];
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
  if (checkinCreated) parts.push('（已自动加入个人运动记录）');
  return parts.join('\n');
}

/**
 * 截图解读（V0.2.57 端到端闭环）
 * ① GLM-4.6V 识图 → 结构化数据
 * ② 识别出运动距离 → sportService.checkin 入个人数据（dataSource='sport_screenshot'，与 device pipeline 一致）
 * ③ 联动 buildUserContext 全量画像（13 路：跑量/目标/跑鞋/计划/心率/睡眠/体成分/天气/饮食/力量）
 * ④ GLM-4.6V 综合分析（截图数据 + 画像 → 个性化建议）
 * ⑤ 落 InterpretRecord type='screenshot'
 */
export async function interpretScreenshot(
  userId: string,
  input: { imageUrl: string; inputKey: string },
): Promise<{ interpretation: string; recordId: string; checkinCreated: boolean }> {
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
      distanceKm: null,
      durationSec: null,
      heartRate: null,
      paceSecPerKm: null,
      calorie: null,
      metrics: [],
      summary: extractRes.content.slice(0, 100),
    };
  }

  // ② 识别出运动距离 → 自动打卡（dataSource='sport_screenshot'，与 device-parser.registry 一致数据源）
  let checkinCreated = false;
  const distKm = Number(extract.distanceKm);
  const sportTypeMap: Record<string, 'run' | 'ride' | 'swim' | 'walk'> = {
    run: 'run',
    ride: 'ride',
    swim: 'swim',
    walk: 'walk',
  };
  if (extract.type !== 'other' && Number.isFinite(distKm) && distKm > 0) {
    const sportType = sportTypeMap[extract.type] ?? 'run';
    try {
      await sportService.checkin(userId, {
        distance: distKm,
        durationSec: extract.durationSec ?? undefined,
        date: new Date().toISOString().slice(0, 10),
        dataSource: 'sport_screenshot',
        sportType,
      } as never);
      checkinCreated = true;
    } catch {
      // checkin 校验失败不阻塞（解读 + 识别数据仍可追溯，人工兜底）
    }
  }

  // ③ 联动个人全量画像（复用 ai-coach context-builder 13 路数据；查失败兜底不阻塞）
  const userProfile = await buildUserContext(userId).catch(() => '（画像数据暂不可用）');

  // ④ GLM-4.6V 综合分析（截图识别数据 + 个人画像 + 原图 → 个性化建议）
  const extractText = formatExtract(extract, checkinCreated);
  const analysisRes = await callGlmVision(
    SCREENSHOT_ANALYSIS_PROMPT,
    `截图识别数据：\n${extractText}\n\n个人健康画像：\n${userProfile}`,
    input.imageUrl,
    { maxTokens: 1500 },
  );

  // ⑤ 落 InterpretRecord（两次 GLM 调用 token 累加）
  const record = await prisma.interpretRecord.create({
    data: {
      userId,
      type: 'screenshot',
      inputKey: input.inputKey,
      result: analysisRes.content,
      model: analysisRes.model,
      inputTokens: extractRes.inputTokens + analysisRes.inputTokens,
      outputTokens: extractRes.outputTokens + analysisRes.outputTokens,
    },
  });

  return { interpretation: analysisRes.content, recordId: record.id, checkinCreated };
}
