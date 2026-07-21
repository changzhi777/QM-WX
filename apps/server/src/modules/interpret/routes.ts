/**
 * interpret module routes — V0.2.33
 *
 * POST /api/interpret { action, payload }（需 JWT）
 *   - garmin  佳明 FIT 解读（payload: { fileBase64, inputKey }）
 *
 * fileBase64：前端上传的 FIT 文件转 base64（不含 data: 前缀）
 * inputKey：COS object key（资料留痕，关联 InterpretRecord）
 */
import type { FastifyInstance } from 'fastify';
import { Errors } from '../../common/errors.js';
import { isMinimaxConfigured, isGlmVisionConfigured } from './client.js';
import { interpretGarminFit, interpretScreenshot, confirmScreenshotCheckin } from './service.js';

export async function interpretRoutes(app: FastifyInstance) {
  // bodyLimit 10MB：FIT 文件 base64 后可能超 Fastify 默认 1MB（base64 比binary大 33%）
  // V0.2.60 P1.5 限流：30 次/分（GLM token 成本控制，复用 upload routes 范式）
  app.post('/', { bodyLimit: 10 * 1024 * 1024, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    if (!req.user) throw Errors.unauthorized();
    const { action, payload } = (req.body ?? {}) as {
      action: string;
      payload?: { fileBase64?: string; inputKey?: string; imageUrl?: string; recordId?: string };
    };
    const inputKey = payload?.inputKey?.trim();

    switch (action) {
      case 'garmin': {
        // 佳明 FIT：minimax M3 文本解读
        if (!isMinimaxConfigured()) throw Errors.featureDisabled('minimax 解读');
        const b64 = payload?.fileBase64?.trim();
        if (!b64 || !inputKey) throw Errors.badRequest('fileBase64 + inputKey 必填');
        const buffer = Buffer.from(b64, 'base64');
        return { code: 0, data: await interpretGarminFit(req.user.id, { buffer, inputKey }) };
      }
      case 'screenshot': {
        // V0.2.60 识图+分析（不 auto checkin），返 extract 供前端确认
        if (!isGlmVisionConfigured()) throw Errors.featureDisabled('AI 视觉解读');
        const imageUrl = payload?.imageUrl?.trim();
        if (!imageUrl || !inputKey) throw Errors.badRequest('imageUrl + inputKey 必填');
        return { code: 0, data: await interpretScreenshot(req.user.id, { imageUrl, inputKey }) };
      }
      case 'screenshotCheckin': {
        // V0.2.60 P1.2 用户确认打卡（查 record.extract + 去重 + checkin）
        const recordId = payload?.recordId?.trim();
        if (!recordId) throw Errors.badRequest('recordId 必填');
        return { code: 0, data: await confirmScreenshotCheckin(req.user.id, { recordId }) };
      }
      default:
        throw Errors.badRequest(`unknown action: ${action}`);
    }
  });
}
