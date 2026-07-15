/**
 * ocr module routes — V0.2.1
 *
 * POST /api/ocr { action, payload: { imageBase64 } }
 *   - generalBasic    通用文字（运动截图成绩）
 *   - generalAccurate 高精度文字（模糊截图增强）
 *   - idCard          身份证实名
 *
 * 输入 imageBase64（前端截图/相册图转 base64，不含 data:image 前缀）。
 */
import type { FastifyInstance } from 'fastify';
import { Errors } from '../../common/errors.js';
import { ocrService } from './ocr.service.js';

export async function ocrRoutes(app: FastifyInstance) {
  app.post('/', async (req) => {
    if (!req.user) throw Errors.unauthorized();
    const { action, payload } = (req.body ?? {}) as { action: string; payload?: { imageBase64?: string } };
    const b64 = payload?.imageBase64?.trim();
    if (!b64) throw Errors.badRequest('imageBase64 必填');
    const image = Buffer.from(b64, 'base64');

    switch (action) {
      case 'generalBasic':
        return { code: 0, data: { lines: await ocrService.generalBasic(image) } };
      case 'generalAccurate':
        return { code: 0, data: { lines: await ocrService.generalAccurate(image) } };
      case 'idCard':
        return { code: 0, data: { card: await ocrService.idCard(image) } };
      default:
        throw Errors.badRequest(`unknown action: ${action}`);
    }
  });
}
