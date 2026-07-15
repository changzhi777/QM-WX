/**
 * food module routes — V0.2.0 FatSecret 饮食搜索
 *
 * POST /api/food { action: 'search', payload: { query } }
 */
import type { FastifyInstance } from 'fastify';
import { Errors } from '../../common/errors.js';
import { searchFood, isFatSecretConfigured } from './client.js';

export async function foodRoutes(app: FastifyInstance) {
  app.post('/', async (req) => {
    if (!req.user) throw Errors.unauthorized();
    const { action, payload } = (req.body ?? {}) as { action: string; payload?: { query?: string } };
    if (action === 'search') {
      if (!isFatSecretConfigured()) throw Errors.badRequest('饮食搜索未配置（FATSECRET_KEY 缺失）');
      const query = payload?.query?.trim();
      if (!query || query.length < 1) throw Errors.badRequest('query 必填');
      const list = await searchFood(query);
      return { code: 0, data: { list } };
    }
    throw Errors.badRequest(`unknown action: ${action}`);
  });
}
