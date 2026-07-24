/**
 * 实时通讯 Redis pub/sub（V0.2.116，替 MQTT）
 *
 * 频道：user:{userId}（每用户一个频道，ws 连接时订阅）
 * 消息格式：JSON { type, data }
 *
 * publishToUser：业务侧推送（dailyReport/通知/动态等）
 * subscribeUser：ws 路由订阅（onMsg → socket.send）
 *
 * 替代 infra/mqtt.ts（EMQX Cloud WSS + mqtt.js + polyfill）— 改用原生 wx.connectSocket + fastify-websocket + Redis pub/sub，去第三方依赖。
 */
import { redis } from './redis.js';

/** 推送给某用户（ws 消息 {type, data}）*/
export async function publishToUser(userId: string, type: string, data: unknown): Promise<void> {
  await redis.publish('user:' + userId, JSON.stringify({ type, data }));
}

/** 兼容旧接口：推送每日简报（stats.service 调，替 mqtt.publishDailyReport）*/
export function publishDailyReport(userId: string, report: unknown): Promise<void> {
  return publishToUser(userId, 'dailyReport', report);
}

/**
 * ws 订阅某用户频道（独立 duplicate 连接，避免阻塞主 redis）
 * 返 unsubscribe fn（socket close 时调）
 */
export async function subscribeUser(userId: string, onMsg: (payload: string) => void): Promise<() => void> {
  const sub = redis.duplicate();
  await sub.subscribe('user:' + userId);
  sub.on('message', (_ch: string, msg: string) => onMsg(msg));
  return () => {
    sub.unsubscribe('user:' + userId).catch(() => {});
    sub.quit().catch(() => {});
  };
}
