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
import { isMinimaxConfigured } from './client.js';
import { interpretGarminFit } from './service.js';

export async function interpretRoutes(app: FastifyInstance) {
  // bodyLimit 10MB：FIT 文件 base64 后可能超 Fastify 默认 1MB（base64 比binary大 33%）
  app.post('/', { bodyLimit: 10 * 1024 * 1024 }, async (req) => {
    if (!req.user) throw Errors.unauthorized();
    if (!isMinimaxConfigured()) throw Errors.featureDisabled('minimax 解读');
    const { action, payload } = (req.body ?? {}) as {
      action: string;
      payload?: { fileBase64?: string; inputKey?: string };
    };
    const b64 = payload?.fileBase64?.trim();
    const inputKey = payload?.inputKey?.trim();
    if (!b64 || !inputKey) throw Errors.badRequest('fileBase64 + inputKey 必填');
    const buffer = Buffer.from(b64, 'base64');

    switch (action) {
      case 'garmin':
        return { code: 0, data: await interpretGarminFit(req.user.id, { buffer, inputKey }) };
      default:
        throw Errors.badRequest(`unknown action: ${action}`);
    }
  });
}
