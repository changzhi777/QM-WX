/**
 * 共享 Errors mock — 替代各测试文件重复定义
 *
 * 用法：
 * ```ts
 * import { mockErrors } from '../../helpers/mockErrors.js';
 *
 * vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));
 * ```
 *
 * 注意：因为 vi.mock 会被 hoist，import 必须用静态 ESM，
 * 且 mockErrors 不能依赖 vi.fn()（hoist 后 vi 还未初始化）。
 */

/** mock Errors 工厂返回的 Error，带 code + statusCode 字段 */
function makeMockError(message: string, code: number, statusCode = code) {
  const e = new Error(message) as Error & { code: number; statusCode: number };
  e.code = code;
  e.statusCode = statusCode;
  return e;
}

/**
 * Errors mock — 与 src/common/errors.ts 的 Errors 工厂一一对应。
 * 行为：返回带 code + statusCode 的普通 Error，便于断言
 *      `await expect(...).rejects.toThrow(...)` 或 `toMatchObject({ code: 4xx })`。
 */
export const mockErrors = {
  unauthorized: (msg = '未登录') => makeMockError(msg, 401),
  forbidden: (msg = '无权访问') => makeMockError(msg, 403),
  notFound: (msg = '资源不存在') => makeMockError(msg, 404),
  badRequest: (msg: string) => makeMockError(msg, 400),
  conflict: (msg: string) => makeMockError(msg, 409),
  internal: (msg = '服务器内部错误') => makeMockError(msg, 500),
  featureDisabled: (feature: string) =>
    makeMockError(`功能「${feature}」尚未开通`, 403),
  notImplemented: (msg = '功能尚未实现') => makeMockError(msg, 501),
} as const;
