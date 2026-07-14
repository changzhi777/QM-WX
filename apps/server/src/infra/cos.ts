/**
 * 腾讯云 COS 基础设施（V0.1.150）
 *
 * 后台 job 从 COS 下载文件（getObject）解析用。
 * 上传（putObject）仍在 upload.service（V0.1.149，已生产验证）。
 * client 构造廉价，两处独立可接受（隔离风险，不动 V0.1.149 上传链路）。
 */
import COS from 'cos-nodejs-sdk-v5';
import { env } from '../config/env.js';

let client: COS | null = null;
let initialized = false;

/** 获取 COS client 单例（配齐 4 字段才建，否则 null） */
export function getCosClient(): COS | null {
  if (!initialized) {
    initialized = true;
    if (env.COS_SECRET_ID && env.COS_SECRET_KEY && env.COS_BUCKET && env.COS_REGION) {
      client = new COS({ SecretId: env.COS_SECRET_ID, SecretKey: env.COS_SECRET_KEY });
    }
  }
  return client;
}

export function isCosConfigured(): boolean {
  return getCosClient() !== null;
}

/**
 * 从 COS 下载对象（后台 job 解析用）
 * @param key COS object key
 * @returns Buffer（文件内容）
 */
export function getObject(key: string): Promise<Buffer> {
  const cos = getCosClient();
  if (!cos) throw new Error('COS not configured');
  return new Promise((resolve, reject) => {
    cos.getObject(
      { Bucket: env.COS_BUCKET!, Region: env.COS_REGION, Key: key },
      (err, data) => {
        if (err) reject(err);
        else resolve(Buffer.from(data.Body as Uint8Array));
      },
    );
  });
}
