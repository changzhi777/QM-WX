/**
 * upload routes 路由层测试 — V0.1.149 COS + 本地混合派发
 *
 * 覆盖：
 * - 鉴权（未登录 → 401）
 * - mime 不在白名单 → 400（路由边界）
 * - type=avatar → 透传 userId + 接收 service.source='cos'
 * - ?localFallback=1 → service 接收 localFallback=true
 * - type=feed-image → 业务类型透传
 *
 * 策略：mock 整个 upload.service.uploadFile（service 单测自己 mock fs/cos）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';

const mockUploadFile = vi.hoisted(() => vi.fn());
vi.mock('src/modules/upload/upload.service.js', () => ({
  uploadFile: mockUploadFile,
  UPLOAD_MAX_SIZE: 5 * 1024 * 1024,
  UPLOAD_ALLOWED_MIME: ['image/jpeg', 'image/png', 'image/webp'],
}));
vi.mock('src/common/errors.js', () => ({
  Errors: {
    unauthorized: () => Object.assign(new Error('unauthorized'), { code: 401, statusCode: 401, name: 'BusinessError' }),
    badRequest: (msg: string) => Object.assign(new Error(msg), { code: 400, statusCode: 400, name: 'BusinessError' }),
  },
}));

import { uploadRoutes } from '../../../src/modules/upload/upload.routes.js';

interface FakeFile {
  filename: string;
  mimetype: string;
  toBuffer: () => Promise<Buffer>;
}

/**
 * duck-typing BusinessError handler —— 跟 app.ts 一致（fastify 4 可能破坏 instanceof，
 * 测试用 mock 的 Errors.badRequest 不继承真 BusinessError）
 */
function installErrorHandler(app: ReturnType<typeof Fastify>) {
  app.setErrorHandler((err, _req, reply) => {
    const e = err as unknown as { name?: string; statusCode?: number; code?: number; message?: string };
    if (e.name === 'BusinessError' && e.statusCode) {
      return reply.status(e.statusCode).send({ code: e.code, msg: e.message });
    }
    return reply.status(e.statusCode || 500).send({ code: e.code || 500, msg: e.message ?? 'unhandled' });
  });
}

async function buildApp(opts: { authed?: boolean; file?: FakeFile | null } = {}) {
  const file = opts.file !== undefined ? opts.file : null;
  const app = Fastify();
  app.decorateRequest('user', undefined);
  app.addHook('onRequest', async (req) => {
    if (opts.authed) {
      (req as { user?: { id: string } }).user = { id: 'u1' };
    } else if (opts.authed === false) {
      // 不设 user
    }
    (req as unknown as { file: () => Promise<FakeFile | null> }).file = async () => file;
  });
  installErrorHandler(app);
  await app.register(uploadRoutes);
  return app;
}

beforeEach(() => vi.clearAllMocks());

describe('upload routes V0.1.149', () => {
  it('未鉴权 → 401', async () => {
    const app = await buildApp({
      authed: false,
      file: { filename: 'a.jpg', mimetype: 'image/jpeg', toBuffer: async () => Buffer.from('x') },
    });
    const r = await app.inject({ method: 'POST', url: '/', payload: {} });
    expect(r.statusCode).toBe(401);
    await app.close();
  });

  it('mime 不在白名单（image/gif）→ 400（路由边界兜底）', async () => {
    const app = await buildApp({
      authed: true,
      file: { filename: 'p.gif', mimetype: 'image/gif', toBuffer: async () => Buffer.from('x') },
    });
    const r = await app.inject({ method: 'POST', url: '/', payload: {} });
    expect(r.statusCode).toBe(400);
    expect(r.json().msg).toMatch(/unsupported mime: image\/gif/);
    expect(mockUploadFile).not.toHaveBeenCalled();
    await app.close();
  });

  it('type=avatar → 透传 userId + 接收 service.source="cos"', async () => {
    mockUploadFile.mockResolvedValue({
      url: 'https://cos-cdn.qingmulife.cn/avatar/u1-ts-abc.jpg',
      size: 1024,
      mime: 'image/jpeg',
      source: 'cos',
    });
    const app = await buildApp({
      authed: true,
      file: { filename: 'a.jpg', mimetype: 'image/jpeg', toBuffer: async () => Buffer.from('x') },
    });
    const r = await app.inject({ method: 'POST', url: '/?type=avatar', payload: {} });
    expect(r.statusCode).toBe(200);
    expect(mockUploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'avatar',
        userId: 'u1',
        mime: 'image/jpeg',
        localFallback: false,
      }),
    );
    expect(r.json().data.url).toBe('https://cos-cdn.qingmulife.cn/avatar/u1-ts-abc.jpg');
    expect(r.json().data.source).toBe('cos');
    await app.close();
  });

  it('?localFallback=1 → service 接收 localFallback=true', async () => {
    mockUploadFile.mockResolvedValue({
      url: '/uploads/avatar/u1-ts-abc.jpg',
      size: 1024,
      mime: 'image/jpeg',
      source: 'local',
    });
    const app = await buildApp({
      authed: true,
      file: { filename: 'a.jpg', mimetype: 'image/jpeg', toBuffer: async () => Buffer.from('x') },
    });
    const r = await app.inject({
      method: 'POST',
      url: '/?type=avatar&localFallback=1',
      payload: {},
    });
    expect(r.statusCode).toBe(200);
    expect(mockUploadFile).toHaveBeenCalledWith(expect.objectContaining({ localFallback: true }));
    expect(r.json().data.source).toBe('local');
    await app.close();
  });

  it('type=feed-image → 业务类型透传', async () => {
    mockUploadFile.mockResolvedValue({
      url: 'https://cos-cdn.qingmulife.cn/feed-image/u1-ts.png',
      size: 2048,
      mime: 'image/png',
      source: 'cos',
    });
    const app = await buildApp({
      authed: true,
      file: { filename: 'p.png', mimetype: 'image/png', toBuffer: async () => Buffer.from('xy') },
    });
    await app.inject({ method: 'POST', url: '/?type=feed-image', payload: {} });
    expect(mockUploadFile).toHaveBeenCalledWith(expect.objectContaining({ type: 'feed-image' }));
    await app.close();
  });
});
