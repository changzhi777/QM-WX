/**
 * upload module — 接收小程序文件上传（V0.1.149 接入腾讯云 COS）
 *
 * POST /api/upload?type=avatar
 *   multipart: file
 *   query:
 *     - type: avatar | feed-image | cert-poster | misc（默认 misc）
 *     - localFallback: 1 → 强制本地（调试 / 应急）
 *   返回：{ code: 0, data: { url, size, mime, source } }
 *
 * Phase 1：本地
 * Phase 1.1（V0.1.149）：腾讯云 COS（广州 ap-guangzhou） + 本地 fallback（混合模式）
 *   - COS 配齐 → 走 COS（公有读 + CDN 域名 cos-cdn.qingmulife.cn）
 *   - COS 缺配置 → 本地 fallback（重启丢）
 *   - COS 运行时失败 → 静默 fallback 本地（韧性优先）
 *   - ?localFallback=1 → 强制本地
 */
import type { FastifyInstance } from 'fastify';
import { Errors } from '../../common/errors.js';
import {
  uploadFile,
  UPLOAD_MAX_SIZE,
  UPLOAD_ALLOWED_MIME,
} from './upload.service.js';
import { createUploadRecord, myUploads } from './upload-record.service.js';

// 走 COS 中转异步解析的数据包/截图 type（建 UploadRecord + 入队）；图片 type（avatar/feed-image/misc）不建
const RECORD_TYPES = new Set([
  'xiaomi_zip',
  'coros_fit',
  'garmin_fit',
  'apple_health',
  'huawei_export',
  'sport_screenshot',
]);

export async function uploadRoutes(app: FastifyInstance) {
  // 限流：5 次/分/用户（防滥用 + COS 成本控制）
  app.post(
    '/',
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (req) => {
      if (!req.user) throw Errors.unauthorized();

      const data = await req.file({ limits: { fileSize: UPLOAD_MAX_SIZE } });
      if (!data) throw Errors.badRequest('no file');
      if (!UPLOAD_ALLOWED_MIME.includes(data.mimetype)) {
        throw Errors.badRequest(`unsupported mime: ${data.mimetype}`);
      }

      const query = (req.query ?? {}) as { type?: string; localFallback?: string };
      // type 限 1-32 字符 + 字母数字下划线横杠（xiaomi_zip / coros_fit / avatar / feed-image 等）
      const type = query.type && /^[a-z0-9_-]{1,32}$/.test(query.type) ? query.type : 'misc';
      const localFallback = query.localFallback === '1';
      // 小米 ZIP 加密包密码（header 传，不进 URL 日志；仅 xiaomi_zip 用）
      const password = req.headers['x-upload-password'] as string | undefined;

      const buffer = await data.toBuffer();
      const result = await uploadFile({
        buffer,
        mime: data.mimetype,
        filename: data.filename ?? undefined,
        type,
        userId: req.user.id,
        localFallback,
      });

      // 数据包/截图 type + COS 上传成功 → 建 UploadRecord → 入队异步解析（本地 fallback 不建）
      let uploadRecordId: string | undefined;
      if (result.source === 'cos' && RECORD_TYPES.has(type)) {
        const objectKey = decodeURIComponent(new URL(result.url).pathname.slice(1));
        const record = await createUploadRecord(req.user.id, {
          type,
          cosUrl: result.url,
          objectKey,
          mime: result.mime,
          size: result.size,
          password: password || undefined,
        });
        uploadRecordId = record.id;
      }

      return { code: 0, data: { ...result, uploadRecordId } };
    },
  );

  // 用户查自己的上传记录（V0.1.150）
  app.post('/records', async (req) => {
    if (!req.user) throw Errors.unauthorized();
    const { page } = (req.body as { page?: number }) ?? {};
    return { code: 0, data: await myUploads(req.user.id, page) };
  });
}

