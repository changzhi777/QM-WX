/**
 * upload routes 冒烟测试
 *
 * 单 endpoint：POST /api/upload（multipart file）
 * 路径：
 * - 未登录 → 401
 * - 无 file → 400
 * - mime 不在白名单 → 400
 * - 正常上传 → 写文件 + 返回 { url, size, mime }
 *
 * 策略：mock @fastify/multipart（自注入 req.file()） + mock fs/promises
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const mockMkdir = vi.fn();
const mockWriteFile = vi.fn();
const mockRandomUUID = vi.fn();
vi.mock('node:fs/promises', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
}));
vi.mock('node:crypto', () => ({
  randomUUID: () => mockRandomUUID(),
}));

import { uploadRoutes } from '../../../src/modules/upload/upload.routes.js';
import { BusinessError } from '../../../src/common/errors.js';

interface FakeFile {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
}

async function buildApp(opts: { authed?: boolean; file?: FakeFile | null } = {}) {
  const file = opts.file !== undefined ? opts.file : null;
  const app = Fastify();
  app.decorateRequest('user', undefined);
  // 在 app 顶层直接挂 hook，作用域全局，uploadRoutes 能看到
  app.addHook('onRequest', async (req) => {
    if (opts.authed !== false) {
      (req as { user?: { id: string } }).user = { id: 'u1' };
    }
    (req as unknown as { file: (opts?: unknown) => Promise<FakeFile | null> }).file =
      async () => file;
  });
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof BusinessError) {
      return reply.status(err.statusCode).send({ code: err.code, msg: err.message });
    }
    return reply.status(500).send({ code: 500, msg: 'unhandled' });
  });
  await app.register(uploadRoutes, { prefix: '/api/upload' });
  return app;
}

describe('POST /api/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockRandomUUID.mockReturnValue('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });

  it('缺 user → 401', async () => {
    const app = await buildApp({ authed: false, file: null });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      payload: {},
    });
    expect(res.statusCode).toBe(401);
  });

  it('无 file → 400', async () => {
    const app = await buildApp({ file: null });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().msg).toBe('no file');
  });

  it('mime 不在白名单（image/gif）→ 400', async () => {
    const app = await buildApp({
      file: {
        filename: 'pic.gif',
        mimetype: 'image/gif',
        toBuffer: async () => Buffer.from('xx'),
      },
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().msg).toMatch(/unsupported mime: image\/gif/);
  });

  it('正常：jpeg + 文件名 → 写 + 返回 url/size/mime', async () => {
    const buf = Buffer.from('jpeg-data');
    const app = await buildApp({
      file: {
        filename: 'avatar.jpg',
        mimetype: 'image/jpeg',
        toBuffer: async () => buf,
      },
    });
    await app.ready();

    const res = await app.inject({
      method: 'POST',
      url: '/api/upload?type=avatar',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.mime).toBe('image/jpeg');
    expect(body.data.size).toBe(buf.length);
    expect(body.data.url).toMatch(/^\/uploads\/avatars\/u1-\d+-aaaaaaaa\.(jpg|jpeg)$/);
    expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('avatars'), { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledWith(
      expect.stringContaining('avatars/u1-'),
      buf,
    );
  });

  it('无扩展名 + image/png → 用 mimeToExt → .png', async () => {
    const app = await buildApp({
      file: {
        filename: 'weird',
        mimetype: 'image/png',
        toBuffer: async () => Buffer.from('png-data'),
      },
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.url).toMatch(/\.png$/);
  });

  it('无扩展名 + image/webp → .webp', async () => {
    const app = await buildApp({
      file: {
        filename: 'no-ext',
        mimetype: 'image/webp',
        toBuffer: async () => Buffer.from('webp-data'),
      },
    });
    await app.ready();
    const res = await app.inject({
      method: 'POST',
      url: '/api/upload',
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.url).toMatch(/\.webp$/);
  });
});
