/**
 * 腾讯云 OCR 基础设施（V0.1.151 Phase 3）
 *
 * 原生 fetch + TC3-HMAC-SHA256 签名（不装 SDK，减镜像体积）。
 * 复用 qmwx-cos-uploader 子用户 SecretId/SecretKey（已关联 QcloudOCRFullAccess 策略）。
 * 通用印刷体 OCR（GeneralBasicOCR）→ 返文本行数组。
 */
import crypto from 'node:crypto';
import { env } from '../config/env.js';

const OCR_HOST = 'ocr.tencentcloudapi.com';
const OCR_SERVICE = 'ocr';
const OCR_ACTION = 'GeneralBasicOCR';

function sha256Hex(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex');
}
function hmacSha256(key: Buffer | string, s: string): Buffer {
  return crypto.createHmac('sha256', key).update(s, 'utf8').digest();
}

/** 构建 TC3-HMAC-SHA256 Authorization header */
function buildAuth(payload: string, timestamp: number): string {
  const secretId = env.COS_SECRET_ID!;
  const secretKey = env.COS_SECRET_KEY!;
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const contentType = 'application/json; charset=utf-8';
  // 1. 拼接规范请求串
  const canonicalReq = [
    'POST',
    '/',
    '',
    `content-type:${contentType}`,
    `host:${OCR_HOST}`,
    `x-tc-action:${OCR_ACTION.toLowerCase()}`,
    '',
    'content-type;host;x-tc-action',
    sha256Hex(payload),
  ].join('\n');
  // 2. 拼接待签名串
  const credentialScope = `${date}/${OCR_SERVICE}/tc3_request`;
  const strToSign = [
    'TC3-HMAC-SHA256',
    String(timestamp),
    credentialScope,
    sha256Hex(canonicalReq),
  ].join('\n');
  // 3. 计算签名（HMAC 链）
  const secretDate = hmacSha256('TC3' + secretKey, date);
  const secretService = hmacSha256(secretDate, OCR_SERVICE);
  const secretSigning = hmacSha256(secretService, 'tc3_request');
  const signature = crypto.createHmac('sha256', secretSigning).update(strToSign, 'utf8').digest('hex');
  // 4. Authorization
  return `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=content-type;host;x-tc-action, Signature=${signature}`;
}

/**
 * 通用印刷体 OCR：图片 buffer → 文本行数组
 * @returns 识别出的文本行（按顺序）
 */
export async function generalOcr(imageBuffer: Buffer): Promise<string[]> {
  const payload = JSON.stringify({ ImageBase64: imageBuffer.toString('base64') });
  const timestamp = Math.floor(Date.now() / 1000);
  const auth = buildAuth(payload, timestamp);
  const res = await fetch(`https://${OCR_HOST}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json; charset=utf-8',
      host: OCR_HOST,
      'x-tc-action': OCR_ACTION.toLowerCase(),
      'x-tc-timestamp': String(timestamp),
      authorization: auth,
    },
    body: payload,
  });
  const data = (await res.json()) as {
    Response?: { TextDetections?: Array<{ DetectedText: string }>; Error?: { Message: string } };
  };
  if (data.Response?.Error) {
    throw new Error(`OCR API: ${data.Response.Error.Message}`);
  }
  return (data.Response?.TextDetections ?? []).map((d) => d.DetectedText);
}

/**
 * 从 OCR 文本行提取运动成绩（距离/时长/配速）
 * 通用正则，覆盖常见运动软件截图（Keep/佳明/悦跑圈/华为）格式
 */
export interface SportScore {
  distanceKm: number | null;
  durationSec: number | null;
  paceSecPerKm: number | null;
}

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
