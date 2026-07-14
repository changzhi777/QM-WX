/**
 * 数据包解析器注册表（V0.1.150 / V0.1.151 扩展）
 *
 * UploadRecord.type → 解析器（userId, buffer, password?）→ ParsedResult
 * 后台 job 从 COS 下载 buffer 后按 type 分发。
 *
 * 已实现：xiaomi_zip / coros_fit / garmin_fit（V0.1.150 + V0.1.151 garmin 复用）
 * Stub（待实现）：apple_health（需 fast-xml-parser）/ huawei_export（需样本）/ sport_screenshot（需 OCR，Phase 3）
 */
import { deviceService } from '../device/device.service.js';
import { sportService } from '../sport/sport.service.js';
import { generalOcr, parseSportScore } from '../../infra/ocr.js';

export type DataUploadType =
  | 'xiaomi_zip'
  | 'coros_fit'
  | 'garmin_fit'
  | 'apple_health'
  | 'huawei_export'
  | 'sport_screenshot';

export interface ParsedResult {
  summary: string;
  detail?: Record<string, unknown>;
}

export type Parser = (userId: string, buffer: Buffer, password?: string) => Promise<ParsedResult>;

export const PARSERS: Record<DataUploadType, Parser> = {
  xiaomi_zip: async (userId, buffer, password) => {
    const r = (await deviceService.importXiaomiZip(
      userId,
      buffer,
      password ?? '',
    )) as Record<string, unknown>;
    return { summary: '小米数据包已解析导入', detail: r };
  },
  coros_fit: async (userId, buffer) => {
    const r = (await deviceService.importCorosFit(userId, buffer)) as Record<string, unknown>;
    return { summary: 'COROS 活动已导入', detail: r };
  },
  // V0.1.151：garmin_fit 复用 importCorosFit（FIT 解析逻辑同；TODO vendor=garmin 区分，当前落库 vendor=coros 来源标，数据正确）
  garmin_fit: async (userId, buffer) => {
    const r = (await deviceService.importCorosFit(userId, buffer)) as Record<string, unknown>;
    return { summary: '佳明 FIT 已导入（来源标 coros，待 garmin 区分）', detail: r };
  },
  // Stub：待实现（需 fast-xml-parser 解析 Health export.xml Workout 记录）
  apple_health: async () => {
    throw new Error('apple_health 解析待实现（Phase 2 续：fast-xml-parser + Workout 提取）');
  },
  // Stub：待主人提供华为运动健康导出样本
  huawei_export: async () => {
    throw new Error('huawei_export 解析待样本（华为运动健康导出格式 proprietary）');
  },
  // Phase 3：截图 OCR（腾讯云通用 OCR + 成绩正则 + 自动建 Checkin，Q2=A 全自动）
  sport_screenshot: async (userId, buffer) => {
    const lines = await generalOcr(buffer);
    const score = parseSportScore(lines);
    let checkinCreated = false;
    let checkinError: string | undefined;
    if (score.distanceKm != null && score.distanceKm > 0) {
      try {
        await sportService.checkin(userId, {
          distance: score.distanceKm,
          durationSec: score.durationSec ?? undefined,
          date: new Date().toISOString().slice(0, 10),
          dataSource: 'sport_screenshot',
          sportType: 'run',
        } as never);
        checkinCreated = true;
      } catch (e) {
        // Checkin 校验失败不阻塞，存 OCR 文本 + 成绩可追溯（人工兜底）
        checkinError = (e as Error).message;
      }
    }
    return {
      summary: `截图 OCR：${score.distanceKm ?? '?'}km${checkinCreated ? '（已自动打卡）' : '（未打卡，存 OCR 文本）'}`,
      detail: { ocrLines: lines.slice(0, 20), score, checkinCreated, checkinError },
    };
  },
};

/** 按 type 取解析器（无则 undefined，调用方决定 status） */
export function getParser(type: string): Parser | undefined {
  return (PARSERS as Record<string, Parser>)[type];
}
