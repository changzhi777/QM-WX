/**
 * 统一错误类型测试
 */
import { describe, it, expect } from 'vitest';
import { BusinessError, Errors } from '../../src/common/errors.js';

describe('BusinessError', () => {
  it('保留 code / message / statusCode', () => {
    const err = new BusinessError(400, 'test', 400);
    expect(err.code).toBe(400);
    expect(err.message).toBe('test');
    expect(err.statusCode).toBe(400);
    expect(err.name).toBe('BusinessError');
  });

  it('默认 statusCode=400', () => {
    const err = new BusinessError(400, 'msg');
    expect(err.statusCode).toBe(400);
  });
});

describe('Errors 工厂', () => {
  it('unauthorized 默认值', () => {
    const e = Errors.unauthorized();
    expect(e).toBeInstanceOf(BusinessError);
    expect(e.code).toBe(401);
    expect(e.statusCode).toBe(401);
    expect(e.message).toBe('未登录');
  });

  it('forbidden 默认值 + 自定义', () => {
    expect(Errors.forbidden().message).toBe('无权访问');
    expect(Errors.forbidden('禁止').message).toBe('禁止');
  });

  it('notFound', () => {
    const e = Errors.notFound('资源 A');
    expect(e.code).toBe(404);
    expect(e.statusCode).toBe(404);
    expect(e.message).toBe('资源 A');
  });

  it('badRequest', () => {
    const e = Errors.badRequest('参数错');
    expect(e.code).toBe(400);
    expect(e.statusCode).toBe(400);
  });

  it('conflict', () => {
    const e = Errors.conflict('已存在');
    expect(e.code).toBe(409);
    expect(e.statusCode).toBe(409);
  });

  it('internal', () => {
    const e = Errors.internal();
    expect(e.code).toBe(500);
  });

  it('featureDisabled 携带 feature 名', () => {
    const e = Errors.featureDisabled('payment');
    expect(e.statusCode).toBe(403);
    expect(e.message).toContain('payment');
  });

  it('notImplemented', () => {
    const e = Errors.notImplemented();
    expect(e.code).toBe(501);
  });
});
