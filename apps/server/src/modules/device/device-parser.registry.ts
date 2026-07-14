/**
 * 数据包解析器注册表（V0.1.150）
 *
 * UploadRecord.type → 解析器（userId, buffer, password?）→ ParsedResult
 * 后台 job 从 COS 下载 buffer 后按 type 分发。
 *
 * Phase 1 注册：xiaomi_zip / coros_fit（复用 device.service 解析器）
 * Phase 2 待加：garmin_fit / huawei_export / apple_health
 * Phase 3 截图 OCR（sport_screenshot 不走此 registry）
 */
import { deviceService } from '../device/device.service.js';

export type DataUploadType = 'xiaomi_zip' | 'coros_fit';

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
};

/** 按 type 取解析器（无则 undefined，调用方决定 status） */
export function getParser(type: string): Parser | undefined {
  return (PARSERS as Record<string, Parser>)[type];
}
