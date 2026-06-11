/**
 * upload module — 接收小程序文件上传
 *
 * POST /api/upload?type=avatar
 *   multipart: file
 *   返回：{ url, size, mime }
 *
 * Phase 1：存本地 apps/server/uploads/，通过 @fastify/static 暴露
 * Phase 1.1：接 OSS / S3，只换实现
 */
import type { FastifyInstance } from 'fastify';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Errors } from '../../common/errors.js';

const UPLOAD_DIR = join(process.cwd(), 'uploads');
const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

export async function uploadRoutes(app: FastifyInstance) {
  app.post('/', async (req) => {
    if (!req.user) throw Errors.unauthorized();

    const data = await req.file({ limits: { fileSize: MAX_SIZE } });
    if (!data) throw Errors.badRequest('no file');

    if (!ALLOWED_MIME.includes(data.mimetype)) {
      throw Errors.badRequest(`unsupported mime: ${data.mimetype}`);
    }

    const ext = extname(data.filename ?? '') || mimeToExt(data.mimetype);
    const filename = `${req.user.id}-${Date.now()}-${randomUUID().slice(0, 8)}${ext}`;
    const subdir = 'avatars';
    const dir = join(UPLOAD_DIR, subdir);
    await mkdir(dir, { recursive: true });

    const filepath = join(dir, filename);
    const buffer = await data.toBuffer();
    await writeFile(filepath, buffer);

    // 公开 URL（@fastify/static 暴露 /uploads/ 前缀）
    const publicUrl = `/uploads/${subdir}/${filename}`;
    return { code: 0, data: { url: publicUrl, size: buffer.length, mime: data.mimetype } };
  });
}

function mimeToExt(mime: string): string {
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  return '.bin';
}
