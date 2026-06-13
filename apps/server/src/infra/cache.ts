/**
 * Redis 缓存抽象层
 *
 * 关注：
 * - 统一 get/set/del 接口（带 TTL + JSON 序列化）
 * - cache-aside 模式：业务层先查 cache，未命中再查 DB + 回填
 * - 写操作必须 invalidate 关联 key
 *
 * 命名约定：`qmwx:cache:{module}:{key}` — 加前缀防 pnpm hoist 串扰
 *
 * 性能权衡：
 * - Redis hit: ~0.5ms；miss: 1 Redis + 1 DB = 5-10ms
 * - TTL 取舍：太短失效频繁，太长不一致窗口大
 *   - feature_flags: 60s（业务决策容忍 1 分钟延迟）
 *   - isAdmin: 30s（白名单变更少见）
 *   - sport.today / listProducts: 60s
 */
import { redis } from './redis.js';

const PREFIX = 'qmwx:cache:';

export interface CacheGetOptions {
  /** key，命名空间在调用方拼接（如 `featureFlags:wallet`） */
  key: string;
}

export interface CacheSetOptions {
  key: string;
  /** 秒 */
  ttlSec: number;
  value: unknown;
}

export class Cache {
  /**
   * 取缓存（JSON 反序列化）
   * 命中返 value；未命中或解析失败返 null
   */
  static async get<T = unknown>(opts: CacheGetOptions): Promise<T | null> {
    try {
      const raw = await redis.get(PREFIX + opts.key);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch (e) {
      // 缓存 fail-open：出错不阻塞业务
      return null;
    }
  }

  /**
   * 写缓存（JSON 序列化 + TTL）
   * 静默失败（不抛 — 业务不该被缓存写入失败影响）
   */
  static async set(opts: CacheSetOptions): Promise<void> {
    try {
      await redis.set(PREFIX + opts.key, JSON.stringify(opts.value), 'EX', opts.ttlSec);
    } catch {
      // ignore
    }
  }

  /**
   * 删一个 key
   */
  static async del(key: string): Promise<void> {
    try {
      await redis.del(PREFIX + key);
    } catch {
      // ignore
    }
  }

  /**
   * 批量删（用 SCAN，避免 KEYS 全扫阻塞 Redis）
   * 用 pattern 匹配（如 `featureFlags:*`）
   */
  static async delByPattern(pattern: string): Promise<number> {
    try {
      let cursor = '0';
      let deleted = 0;
      do {
        const result = await redis.scan(cursor, 'MATCH', PREFIX + pattern, 'COUNT', 100);
        const nextCursor = String(result[0]);
        const keys = result[1];
        cursor = nextCursor;
        for (const k of keys) {
          const localKey = k.startsWith(PREFIX) ? k.slice(PREFIX.length) : k;
          await redis.del(PREFIX + localKey);
          deleted++;
        }
      } while (cursor !== '0');
      return deleted;
    } catch {
      return 0;
    }
  }

  /**
   * cache-aside 便捷包装：get 或 set
   *
   * @param key 缓存 key
   * @param ttlSec TTL
   * @param loader 未命中时调用的加载函数（DB / API）
   */
  static async wrap<T>(
    key: string,
    ttlSec: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await Cache.get<T>({ key });
    if (cached !== null) return cached;
    const fresh = await loader();
    await Cache.set({ key, ttlSec, value: fresh });
    return fresh;
  }
}
