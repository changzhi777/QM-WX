/**
 * Redis 客户端单例（ioredis）
 *
 * 用途：会话、限流、排行榜、BullMQ 队列
 */
import Redis from 'ioredis';
import { env } from '../config/env.js';

const globalForRedis = globalThis as unknown as { redis?: Redis };

export const redis =
  globalForRedis.redis ??
  new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // BullMQ 要求
    enableReadyCheck: false,
  });

if (env.NODE_ENV !== 'production') {
  globalForRedis.redis = redis;
}
