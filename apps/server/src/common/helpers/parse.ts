/**
 * Zod parse → 出错抛 BusinessError（badRequest）
 *
 * 用途：fastify 路由内解析 action payload。setErrorHandler 对 ZodError 的处理在
 * inject（e2e）模式不可靠，故各 module 路由内 inline try/catch 兜底。本 helper
 * 统一该模式，消除 8+ 处重复定义。
 *
 * 后续迁移：sport/stats/ranking/cart/points/address/coupon 等本地定义可逐步替换为
 * import 此 helper。
 */
import { z } from 'zod';
import { Errors } from '../errors.js';

export function parseOrBadRequest<S extends z.ZodTypeAny>(
  schema: S,
  payload: unknown,
): z.output<S> {
  try {
    return schema.parse(payload) as z.output<S>;
  } catch (e) {
    if (e instanceof z.ZodError) {
      const first = e.issues[0];
      throw Errors.badRequest(`${first.path.join('.')}: ${first.message}`);
    }
    throw e;
  }
}
