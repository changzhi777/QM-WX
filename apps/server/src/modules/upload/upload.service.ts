/**
 * upload service — 腾讯云 COS / 本地 上传逻辑
 *
 * V0.1.149 引入腾讯云 COS（广州 ap-guangzhou），含混合模式：
 * - 默认走 COS putObject（公有读 Bucket + CDN 域名）
 * - COS 配置缺失 → 自动走本地
 * - COS 请求运行时失败 → 自动 fallback 到本地（韧性优先）
 * - ?localFallback=1 → 强制本地（调试 / 应急使用）
 *
 * 单桶策略：Bucket=qm-wx-1418512491，公有读，object key 用 `{type}/{userId}-{ts}-{8chars}.{ext}`
 */
import { env } from '../../config/env.js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import COS from 'cos-nodejs-sdk-v5';

const MAX_SIZE = 50 * 1024 * 1024; // 50MB（V0.1.150 数据包扩展）
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/zip', 'application/octet-stream'];
const UPLOAD_DIR = join(process.cwd(), 'uploads');

// ---------- COS 工厂（每次新建；mock 单测时无需关心缓存；SDK 构造廉价可接受） ----------
function getCos(): COS | null {
  if (!env.COS_SECRET_ID || !env.COS_SECRET_KEY || !env.COS_BUCKET || !env.COS_REGION) {
    return null;
  }
  return new COS({
    SecretId: env.COS_SECRET_ID,
    SecretKey: env.COS_SECRET_KEY,
  });
}

// ---------- 类型 ----------
export interface UploadInput {
  buffer: Buffer;
  mime: string;
  filename?: string;
  /** 业务类型，决定 object key 路径前缀，如 avatar / feed-image / cert-poster */
  type: string;
  userId: string;
  /** ?localFallback=1 时强制本地 */
  localFallback?: boolean;
}

export interface UploadResult {
  url: string;
  size: number;
  mime: string;
  source: 'cos' | 'local';
}

// ---------- 工具 ----------
export function mimeToExt(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'application/zip') return '.zip';
  return '.bin'; // octet-stream（fit 等数据包）→ uploadToCos 靠 filename extname 推断 .fit
}

export function shouldUseCos(input: { localFallback?: boolean }): boolean {
  if (input.localFallback) return false;
  return getCos() !== null;
}

/** 公开：测试可读 env 是否配齐 */
export function isCosConfigured(): boolean {
  return getCos() !== null;
}

// ---------- COS 上传 ----------
export async function uploadToCos(input: UploadInput): Promise<UploadResult> {
  const cos = getCos();
  if (!cos) throw new Error('COS not configured');
  const ext = extname(input.filename ?? '') || mimeToExt(input.mime);
  const key = `${input.type}/${input.userId}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;

  await cos.putObject({
    Bucket: env.COS_BUCKET!,
    Region: env.COS_REGION!,
    Key: key,
    Body: input.buffer,
    ContentType: input.mime,
  });

  // 公开 URL：优先 CDN 域名，否则 COS 默认域名（{bucket}.cos.{region}.myqcloud.com）
  const cdn = env.COS_CDN_DOMAIN?.trim();
  const url = cdn
    ? `https://${cdn}/${key}`
    : `https://${env.COS_BUCKET}.cos.${env.COS_REGION}.myqcloud.com/${key}`;

  return { url, size: input.buffer.length, mime: input.mime, source: 'cos' };
}

// ---------- 本地上传（Phase 1 保留作 fallback） ----------
export async function uploadToLocal(input: UploadInput): Promise<UploadResult> {
  const ext = extname(input.filename ?? '') || mimeToExt(input.mime);
  const filename = `${input.userId}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
  const dir = join(UPLOAD_DIR, input.type);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, filename), input.buffer);

  return {
    url: `/uploads/${input.type}/${filename}`,
    size: input.buffer.length,
    mime: input.mime,
    source: 'local',
  };
}

// ---------- 派发 ----------
export async function uploadFile(input: UploadInput): Promise<UploadResult> {
  if (!ALLOWED_MIME.includes(input.mime)) {
    throw new Error(`unsupported mime: ${input.mime}`);
  }
  if (input.buffer.length > MAX_SIZE) {
    throw new Error(`file too large: ${input.buffer.length} > ${MAX_SIZE}`);
  }
  if (shouldUseCos(input)) {
    try {
      return await uploadToCos(input);
    } catch {
      // COS 配置正确但运行时失败 → 静默 fallback 到本地（不抛错，确保上传链路可用）
      return await uploadToLocal(input);
    }
  }
  return await uploadToLocal(input);
}

export const UPLOAD_MAX_SIZE = MAX_SIZE;
export const UPLOAD_ALLOWED_MIME = ALLOWED_MIME;
