/**
 * ocr module service — V0.2.1 多场景 OCR
 *
 * 复用官方 SDK client（替 V0.1.151 手写），支持：
 * - generalBasic：通用印刷体（快，运动截图成绩识别）
 * - generalAccurate：通用高精度（准但慢，模糊截图增强）
 * - idCard：身份证实名（赛事报名/账户安全）
 *
 * 输入统一 image Buffer（routes 层 base64 → Buffer）。
 */
import { getOcrClient, isOcrConfigured } from './ocr.client.js';
import { Errors } from '../../common/errors.js';

function ensureConfigured() {
  if (!isOcrConfigured()) throw Errors.badRequest('OCR 未配置（COS_SECRET_ID/KEY 缺失）');
}

interface TextDetection {
  DetectedText: string;
}

export const ocrService = {
  /** 通用印刷体 OCR → 文本行数组（运动截图成绩识别）*/
  async generalBasic(image: Buffer): Promise<string[]> {
    ensureConfigured();
    const client = getOcrClient();
    const res = (await client.GeneralBasicOCR({ ImageBase64: image.toString('base64') })) as {
      TextDetections?: TextDetection[];
    };
    return (res.TextDetections ?? []).map((d) => d.DetectedText);
  },

  /** 通用高精度 OCR → 文本行数组（模糊截图增强）*/
  async generalAccurate(image: Buffer): Promise<string[]> {
    ensureConfigured();
    const client = getOcrClient();
    const res = (await client.GeneralAccurateOCR({ ImageBase64: image.toString('base64') })) as {
      TextDetections?: TextDetection[];
    };
    return (res.TextDetections ?? []).map((d) => d.DetectedText);
  },

  /** 身份证实名识别 → { name, idNo, sex, birth, address } */
  async idCard(image: Buffer) {
    ensureConfigured();
    const client = getOcrClient();
    const res = (await client.IDCardOCR({ ImageBase64: image.toString('base64') })) as {
      Name?: string;
      IdNum?: string;
      Sex?: string;
      Birth?: string;
      Address?: string;
    };
    return {
      name: res.Name ?? null,
      idNo: res.IdNum ?? null,
      sex: res.Sex ?? null,
      birth: res.Birth ?? null,
      address: res.Address ?? null,
    };
  },
};
