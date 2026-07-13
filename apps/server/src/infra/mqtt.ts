/**
 * MQTT 单例（V0.1.144，EMQX Cloud Serverless，AI 简报推送）
 *
 * 连接：mqtts://host:8883（TLS，DigiCert Root G2 系统信任，ca 双保险）
 * Topic：qmwx/{userId}/daily-report（每日 AI 健康简报推送）
 *
 * 缺省（MQTT_USERNAME/PASSWORD 未配）：getMqttClient 返 null，publishDailyReport 跳过，
 * 前端走 stats.dailyReport API 拉（兜底，C 方案）。
 */
import mqtt from 'mqtt';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { logger } from '../common/logger.js';

let client: mqtt.MqttClient | null = null;

/** 获取 MQTT 单例（未配置返 null，调用方自行 fallback）*/
export function getMqttClient(): mqtt.MqttClient | null {
  if (!env.MQTT_USERNAME || !env.MQTT_PASSWORD) {
    return null;
  }
  if (client) return client;
  const caPath = path.resolve(process.cwd(), env.MQTT_CA_PATH);
  client = mqtt.connect({
    host: env.MQTT_HOST,
    port: env.MQTT_PORT,
    protocol: 'mqtts',
    username: env.MQTT_USERNAME,
    password: env.MQTT_PASSWORD,
    ca: fs.existsSync(caPath) ? [fs.readFileSync(caPath)] : undefined,
    rejectUnauthorized: true,
  });
  client.on('connect', () => logger.info({ host: env.MQTT_HOST }, 'MQTT connected'));
  client.on('error', (err) => logger.error({ err: err.message }, 'MQTT error'));
  client.on('reconnect', () => logger.warn('MQTT reconnecting'));
  return client;
}

/** 推送每日 AI 简报（qos 1，未配置 MQTT 则跳过，前端走 API 兜底）*/
export function publishDailyReport(userId: string, report: unknown): Promise<void> {
  const c = getMqttClient();
  if (!c) return Promise.resolve();
  const topic = `qmwx/${userId}/daily-report`;
  return new Promise((resolve) => {
    c.publish(topic, JSON.stringify(report), { qos: 1 }, () => resolve());
  });
}

/** 关闭连接（优雅关闭用）*/
export async function closeMqtt(): Promise<void> {
  if (!client) return;
  await client.endAsync();
  client = null;
}
