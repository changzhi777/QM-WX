/**
 * 运动成绩解析（纯函数）— V0.2.1
 *
 * parseSportScore：从 OCR 文本行提取距离/时长/配速（通用正则），被 device-parser registry 复用。
 *
 * V0.2.1 变更：OCR 调用（原 V0.1.151 手写 TC3 generalOcr）已迁移到 modules/ocr/ocr.service
 * （官方精简包 SDK）。本文件只留纯解析函数，零外部依赖。
 */

export interface SportScore {
  distanceKm: number | null;
  durationSec: number | null;
  paceSecPerKm: number | null;
}

/**
 * 从 OCR 文本行提取运动成绩（距离/时长/配速）
 * 通用正则，覆盖常见运动软件截图（Keep/佳明/悦跑圈/华为）格式
 */
export function parseSportScore(lines: string[]): SportScore {
  const text = lines.join(' ');
  // 距离：12.34 km / 12.34 公里 / 12.3KM
  const distMatch = text.match(/(\d+\.?\d*)\s*(?:km|公里|千米)/i);
  const distanceKm = distMatch ? Number(distMatch[1]) : null;
  // 时长：1:23:45 / 1小时23分 / 83:45（分:秒）
  const dur1 = text.match(/(\d+):(\d{2}):(\d{2})/); // h:mm:ss
  const dur2 = text.match(/(\d+):(\d{2})/); // mm:ss
  const dur3 = text.match(/(\d+)\s*小时\s*(\d+)?\s*分?/);
  let durationSec: number | null = null;
  if (dur1) durationSec = Number(dur1[1]) * 3600 + Number(dur1[2]) * 60 + Number(dur1[3]);
  else if (dur2) durationSec = Number(dur2[1]) * 60 + Number(dur2[2]);
  else if (dur3) durationSec = Number(dur3[1]) * 3600 + (dur3[2] ? Number(dur3[2]) * 60 : 0);
  // 配速：5'30" / 5′30″ / 5:30 / 530（每公里）
  const paceMatch = text.match(/(\d{1,2})['′:](\d{2})["″]/);
  const paceSecPerKm = paceMatch ? Number(paceMatch[1]) * 60 + Number(paceMatch[2]) : null;
  return { distanceKm, durationSec, paceSecPerKm };
}
