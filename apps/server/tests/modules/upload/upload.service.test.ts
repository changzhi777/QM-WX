/**
 * upload.service 单测 — V0.1.149 COS / 本地 双轨派发
 *
 * 覆盖：
 * - shouldUseCos: 缺配置 / 有配置 / localFallback 强制
 * - uploadToCos: COS 配齐时调用 putObject 并返 COS URL
 * - uploadToLocal: 写入 uploads/{type}/ 返本地 path
 * - uploadFile: 派发 + COS 失败自动 fallback 本地
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------- mock env（hoisted 可变引用 —— service 实时读 env）----------
const _envState = vi.hoisted(() => ({
  envRef: {
    NODE_ENV: 'test',
    COS_SECRET_ID: undefined as string | undefined,
    COS_SECRET_KEY: undefined as string | undefined,
    COS_REGION: 'ap-guangzhou',
    COS_BUCKET: undefined as string | undefined,
    COS_CDN_DOMAIN: 'cos-cdn.qingmulife.cn' as string | undefined,
  },
}));
vi.mock('src/config/env.js', () => ({ env: _envState.envRef }));

// ---------- mock cos SDK ----------
const _putObject = vi.hoisted(() => vi.fn());
const _cosCtor = vi.hoisted(() => vi.fn(function MockCOS(this: unknown) {
  this.putObject = _putObject;
}));
vi.mock('cos-nodejs-sdk-v5', () => ({
  default: _cosCtor,
}));

// ---------- mock node:fs/promises（不想真写文件） ----------
const _writeFile = vi.hoisted(() => vi.fn(async () => undefined));
const _mkdir = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('node:fs/promises', () => ({
  writeFile: _writeFile,
  mkdir: _mkdir,
}));

import {
  shouldUseCos,
  isCosConfigured,
  uploadToCos,
  uploadToLocal,
  uploadFile,
  UPLOAD_MAX_SIZE,
  UPLOAD_ALLOWED_MIME,
} from 'src/modules/upload/upload.service.js';

const TEST_BUFFER = Buffer.from('hello-cos-test');
const TEST_MIME = 'image/jpeg';

beforeEach(() => {
  vi.clearAllMocks();
  _envState.envRef.COS_SECRET_ID = undefined;
  _envState.envRef.COS_SECRET_KEY = undefined;
  _envState.envRef.COS_BUCKET = undefined;
  _envState.envRef.COS_CDN_DOMAIN = 'cos-cdn.qingmulife.cn';
  // 重置 getCos lazy 单例（内部 _cos 私有；通过重置 env 间接失效）
});

describe('constants', () => {
  it('UPLOAD_MAX_SIZE = 5MB', () => {
    expect(UPLOAD_MAX_SIZE).toBe(5 * 1024 * 1024);
  });

  it('UPLOAD_ALLOWED_MIME 仅允许 jpeg/png/webp', () => {
    expect(UPLOAD_ALLOWED_MIME).toEqual(['image/jpeg', 'image/png', 'image/webp']);
  });
});

describe('shouldUseCos (V0.1.149)', () => {
  it('缺 COS_* env → 返 false（走本地）', () => {
    expect(isCosConfigured()).toBe(false);
    expect(shouldUseCos({})).toBe(false);
  });

  it('localFallback=true → 强制返 false（跳过 COS）', () => {
    _envState.envRef.COS_SECRET_ID = 'sid';
    _envState.envRef.COS_SECRET_KEY = 'skey';
    _envState.envRef.COS_BUCKET = 'qmwx-prod';
    expect(shouldUseCos({ localFallback: true })).toBe(false);
  });

  it('COS 配置配齐 + localFallback=false → 返 true', () => {
    _envState.envRef.COS_SECRET_ID = 'AKIDxxxxxxxxxxxx';
    _envState.envRef.COS_SECRET_KEY = 'skey-32charsxxxxxxxxxxxxxxxxxx';
    _envState.envRef.COS_BUCKET = 'qmwx-prod';
    expect(shouldUseCos({})).toBe(true);
  });
});

describe('uploadToLocal (V0.1.149)', () => {
  it('写入 uploads/{type}/{userId}-{ts}-{8chars}.{ext} 并返本地 URL', async () => {
    const r = await uploadToLocal({
      buffer: TEST_BUFFER,
      mime: TEST_MIME,
      filename: 'avatar.jpg',
      type: 'avatar',
      userId: 'u1',
    });

    expect(_mkdir).toHaveBeenCalledWith(expect.stringContaining('uploads/avatar'), { recursive: true });
    expect(_writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/uploads\/avatar\/u1-\d+-[0-9a-f]{8}\.jpg/),
      TEST_BUFFER,
    );
    expect(r.url).toMatch(/^\/uploads\/avatar\/u1-\d+-[0-9a-f]{8}\.jpg$/);
    expect(r.source).toBe('local');
    expect(r.size).toBe(TEST_BUFFER.length);
    expect(r.mime).toBe(TEST_MIME);
  });

  it('文件无后缀时按 mime 推断 .jpg', async () => {
    const r = await uploadToLocal({
      buffer: TEST_BUFFER,
      mime: TEST_MIME,
      filename: undefined,
      type: 'feed-image',
      userId: 'u2',
    });
    expect(r.url).toMatch(/\.jpg$/);
  });
});

describe('uploadToCos (V0.1.149)', () => {
  it('COS 配齐 → putObject + 返 CDN URL', async () => {
    _envState.envRef.COS_SECRET_ID = 'AKIDxxxxxxxxxxxx';
    _envState.envRef.COS_SECRET_KEY = 'skey-32charsxxxxxxxxxxxxxxxxxx';
    _envState.envRef.COS_BUCKET = 'qmwx-prod';
    _envState.envRef.COS_CDN_DOMAIN = 'cos-cdn.qingmulife.cn';
    _putObject.mockResolvedValue({} as never);

    const r = await uploadToCos({
      buffer: TEST_BUFFER,
      mime: TEST_MIME,
      filename: 'avatar.jpg',
      type: 'avatar',
      userId: 'u1',
    });

    expect(_cosCtor).toHaveBeenCalledWith({
      SecretId: 'AKIDxxxxxxxxxxxx',
      SecretKey: 'skey-32charsxxxxxxxxxxxxxxxxxx',
    });
    expect(_putObject).toHaveBeenCalledWith({
      Bucket: 'qmwx-prod',
      Region: 'ap-guangzhou',
      Key: expect.stringMatching(/^avatar\/u1-\d+-[0-9a-f]{8}\.jpg$/),
      Body: TEST_BUFFER,
      ContentType: TEST_MIME,
    });
    expect(r.url).toMatch(/^https:\/\/cos-cdn\.qingmulife\.cn\/avatar\/u1-\d+-[0-9a-f]{8}\.jpg$/);
    expect(r.source).toBe('cos');
  });

  it('无 COS_CDN_DOMAIN → 走 COS 默认域名格式', async () => {
    _envState.envRef.COS_SECRET_ID = 'AKIDxxxxxxxxxxxx';
    _envState.envRef.COS_SECRET_KEY = 'skey';
    _envState.envRef.COS_BUCKET = 'qmwx-prod';
    _envState.envRef.COS_CDN_DOMAIN = undefined;
    _putObject.mockResolvedValue({} as never);

    const r = await uploadToCos({
      buffer: TEST_BUFFER,
      mime: TEST_MIME,
      filename: 'feed.jpg',
      type: 'feed-image',
      userId: 'u1',
    });

    expect(r.url).toMatch(
      /^https:\/\/qmwx-prod\.cos\.ap-guangzhou\.myqcloud\.com\/feed-image\/u1-\d+-[0-9a-f]{8}\.jpg$/,
    );
  });

  it('缺 COS_SECRET_ID → 抛错（调用方应 fallback 兜底）', async () => {
    await expect(
      uploadToCos({
        buffer: TEST_BUFFER,
        mime: TEST_MIME,
        type: 'avatar',
        userId: 'u1',
      }),
    ).rejects.toThrow(/not configured/i);
  });
});

describe('uploadFile (V0.1.149) 派发 + fallback', () => {
  it('MIME 不在白名单 → 抛 unsupported mime', async () => {
    await expect(
      uploadFile({
        buffer: TEST_BUFFER,
        mime: 'image/gif',
        type: 'avatar',
        userId: 'u1',
      }),
    ).rejects.toThrow(/unsupported mime: image\/gif/);
  });

  it('文件过大 → 抛 file too large', async () => {
    await expect(
      uploadFile({
        buffer: Buffer.alloc(UPLOAD_MAX_SIZE + 1),
        mime: TEST_MIME,
        type: 'avatar',
        userId: 'u1',
      }),
    ).rejects.toThrow(/file too large/);
  });

  it('无 COS 配置 → 走本地', async () => {
    const r = await uploadFile({
      buffer: TEST_BUFFER,
      mime: TEST_MIME,
      type: 'avatar',
      userId: 'u1',
    });
    expect(r.source).toBe('local');
    expect(_putObject).not.toHaveBeenCalled();
  });

  it('COS 配齐 → 走 COS（无 fallback）', async () => {
    _envState.envRef.COS_SECRET_ID = 'sid';
    _envState.envRef.COS_SECRET_KEY = 'skey';
    _envState.envRef.COS_BUCKET = 'bucket';
    _putObject.mockResolvedValue({} as never);

    const r = await uploadFile({
      buffer: TEST_BUFFER,
      mime: TEST_MIME,
      type: 'avatar',
      userId: 'u1',
    });
    expect(r.source).toBe('cos');
    expect(_putObject).toHaveBeenCalled();
  });

  it('COS putObject 抛错 → 自动 fallback 本地（韧性）', async () => {
    _envState.envRef.COS_SECRET_ID = 'sid';
    _envState.envRef.COS_SECRET_KEY = 'skey';
    _envState.envRef.COS_BUCKET = 'bucket';
    _putObject.mockRejectedValue(new Error('network timeout'));

    const r = await uploadFile({
      buffer: TEST_BUFFER,
      mime: TEST_MIME,
      type: 'avatar',
      userId: 'u1',
    });
    expect(r.source).toBe('local');
    expect(_writeFile).toHaveBeenCalled(); // fallback 写入本地
  });

  it('localFallback=true → 直接走本地（绕 COS）', async () => {
    _envState.envRef.COS_SECRET_ID = 'sid';
    _envState.envRef.COS_SECRET_KEY = 'skey';
    _envState.envRef.COS_BUCKET = 'bucket';
    // 即使 COS 配齐，localFallback=true 也走本地

    const r = await uploadFile({
      buffer: TEST_BUFFER,
      mime: TEST_MIME,
      type: 'avatar',
      userId: 'u1',
      localFallback: true,
    });
    expect(r.source).toBe('local');
    expect(_putObject).not.toHaveBeenCalled();
  });
});
