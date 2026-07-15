/**
 * 数据包解析器注册表（V0.1.150 / V0.1.151 扩展 / V0.2.2 huawei_export 落地）
 *
 * UploadRecord.type → 解析器（userId, buffer, password?）→ ParsedResult
 * 后台 job 从 COS 下载 buffer 后按 type 分发。
 *
 * 已实现：xiaomi_zip / coros_fit / garmin_fit（V0.1.150 + V0.1.151 garmin 复用）/
 *         apple_health（V0.1.151）/**huawei_export**（V0.2.2 init #11 落地，Hitrava schema）/
 *         sport_screenshot（V0.1.151 → V0.2.1 OCR SDK 迁移）
 */
import { deviceService } from '../device/device.service.js';
import { sportService } from '../sport/sport.service.js';
import { parseSportScore } from '../../infra/ocr.js';
import { ocrService } from '../ocr/ocr.service.js'; // V0.2.1 OCR 调用迁移到官方 SDK module
import { XMLParser } from 'fast-xml-parser';
import { parseHuaweiExport } from './parsers/huawei-export.parser.js'; // V0.2.2 init #11

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
  // Phase 2：苹果 Health export.xml → Workout（跑步）→ 循环建 Checkin（dataSource=apple_health）
  apple_health: async (userId, buffer) => {
    const xml = buffer.toString('utf8');
    const parsed = new XMLParser({ ignoreAttributes: false }).parse(xml);
    const raw = parsed?.HealthData?.Workout ?? [];
    const list = Array.isArray(raw) ? raw : [raw];
    let imported = 0;
    for (const w of list) {
      const type = w.workoutActivityType ?? w['@_workoutActivityType'];
      if (type !== 'HKWorkoutActivityTypeRunning') continue;
      const distRaw = Number(w.totalDistance ?? w['@_totalDistance']) || null;
      const unit = w.totalDistanceUnit ?? w['@_totalDistanceUnit'];
      const distanceKm = distRaw != null
        ? unit === 'mi' ? distRaw * 1.609 : distRaw
        : null;
      const durationSec = Number(w.duration ?? w['@_duration']) || null;
      const startDate = String(w.startDate ?? w['@_startDate'] ?? new Date().toISOString());
      if (distanceKm != null && distanceKm > 0) {
        try {
          await sportService.checkin(userId, {
            distance: distanceKm,
            durationSec: durationSec ?? undefined,
            date: startDate.slice(0, 10),
            dataSource: 'apple_health',
            sportType: 'run',
          } as never);
          imported++;
        } catch {
          // 单条失败跳过，继续下一条
        }
      }
    }
    return { summary: `苹果 Health 导入 ${imported} 条跑步（共 ${list.length} Workout）`, detail: { imported, total: list.length } };
  },
  // V0.2.2 init #11：华为运动健康导出（Hitrava v6.3.0 逆向 schema + AES ZIP + 降级兼容）
  huawei_export: async (userId, buffer, password) => {
    const result = await parseHuaweiExport(buffer, password);
    let imported = 0;
    const errors: string[] = [];
    for (const act of result.activities) {
      if (act.distanceKm <= 0) continue; // 无距离跳过（瑜伽等）
      try {
        await sportService.checkin(userId, {
          distance: act.distanceKm,
          durationSec: act.durationSec || undefined,
          date: act.startedAt.toISOString().slice(0, 10),
          dataSource: 'huawei_export',
          sportType: act.sport === 'run' ? 'run' : (act.sport as never),
        } as never);
        imported++;
      } catch (e) {
        errors.push((e as Error).message);
      }
    }
    return {
      summary: `华为运动健康导入 ${imported}/${result.filteredCount} 条有效运动（共 ${result.rawCount} 条原始）`,
      detail: {
        imported,
        rawCount: result.rawCount,
        filteredCount: result.filteredCount,
        errorCount: errors.length,
        errors: errors.slice(0, 3), // 截前 3 个错误
      },
    };
  },
  // Phase 3：截图 OCR（腾讯云通用 OCR + 成绩正则 + 自动建 Checkin，Q2=A 全自动）
  sport_screenshot: async (userId, buffer) => {
    const lines = await ocrService.generalBasic(buffer);
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
