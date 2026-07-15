/**
 * 腾讯云 OCR client 单例（V0.2.1）
 *
 * 用官方精简包 tencentcloud-sdk-nodejs-ocr（替 V0.1.151 手写 TC3 签名）。
 * 复用 COS SecretId/SecretKey（qmwx-cos-uploader 子用户已关联 QcloudOCRFullAccess 策略）。
 * 缺省 region = COS_REGION（广州 ap-guangzhou）。
 */
import { ocr } from 'tencentcloud-sdk-nodejs-ocr';
import { env } from '../../config/env.js';

const OcrClient = ocr.v20181119.Client;
type OcrClientInstance = InstanceType<typeof OcrClient>;

let clientInstance: OcrClientInstance | null = null;

/** OCR 是否已配置（复用 COS key）*/
export function isOcrConfigured(): boolean {
  return !!env.COS_SECRET_ID && !!env.COS_SECRET_KEY;
}

/** 单例 OCR client（首次调用惰性创建）*/
export function getOcrClient(): OcrClientInstance {
  if (!isOcrConfigured()) {
    throw new Error('OCR 未配置（COS_SECRET_ID/KEY 缺失）');
  }
  if (!clientInstance) {
    clientInstance = new OcrClient({
      credential: { secretId: env.COS_SECRET_ID!, secretKey: env.COS_SECRET_KEY! },
      region: env.COS_REGION,
      profile: {
        signMethod: 'HmacSHA256',
        httpProfile: { reqTimeout: 30 },
      },
    });
  }
  return clientInstance;
}

/** 测试用：重置单例（生产代码勿调）*/
export function __resetOcrClientForTest(): void {
  clientInstance = null;
}
