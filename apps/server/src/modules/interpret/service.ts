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
import { callMinimax, isMinimaxConfigured, type MinimaxMessage } from './client.js';

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
