/**
 * 统一错误类型
 *
 * service / route 抛 BusinessError 由统一错误处理中间件转 { code, msg }。
 */
export class BusinessError extends Error {
  constructor(
    public readonly code: number,
    message: string,
    public readonly statusCode: number = 400,
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}

export const Errors = {
  unauthorized: (msg = '未登录') => new BusinessError(401, msg, 401),
  forbidden: (msg = '无权访问') => new BusinessError(403, msg, 403),
  notFound: (msg = '资源不存在') => new BusinessError(404, msg, 404),
  badRequest: (msg: string) => new BusinessError(400, msg, 400),
  conflict: (msg: string) => new BusinessError(409, msg, 409),
  internal: (msg = '服务器内部错误') => new BusinessError(500, msg, 500),
  featureDisabled: (feature: string) =>
    new BusinessError(403, `功能「${feature}」尚未开通`, 403),
  notImplemented: (msg = '功能尚未实现') => new BusinessError(501, msg, 501),
} as const;
