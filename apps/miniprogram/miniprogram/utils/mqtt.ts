// utils/mqtt.ts — MQTT 订阅（V0.1.144，EMQX Cloud WSS，dailyReport 推送）
// polyfill WebSocket（wx.connectSocket → WebSocket-like）+ mqtt.js 订阅
// 前端订阅 qmwx/{userId}/daily-report，收到推送自动更新今日 tab（API 拉兜底）

// === polyfill WebSocket（mqtt.js 依赖 new WebSocket(url)）===
class WxWebSocket {
  private task: WechatMiniprogram.SocketTask | null = null;
  onopen: ((ev: { type: string }) => void) | null = null;
  onmessage: ((ev: { data: string | ArrayBuffer }) => void) | null = null;
  onclose: ((ev: { type: string }) => void) | null = null;
  onerror: ((ev: { type: string }) => void) | null = null;
  readyState = 0;
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url: string, protocols?: string | string[]) {
    this.task = wx.connectSocket({
      url,
      protocols: Array.isArray(protocols) ? protocols : protocols ? [protocols] : [],
    } as WechatMiniprogram.ConnectSocketOption);
    this.task.onOpen(() => {
      this.readyState = 1;
      this.onopen?.({ type: 'open' });
    });
    this.task.onMessage((res) => {
      this.onmessage?.({ data: res.data });
    });
    this.task.onClose(() => {
      this.readyState = 3;
      this.onclose?.({ type: 'close' });
    });
    this.task.onError(() => {
      this.onerror?.({ type: 'error' });
    });
  }

  send(data: string | ArrayBuffer) {
    this.task?.send({ data: data as string });
  }

  close() {
    this.readyState = 2;
    this.task?.close({});
  }
}

// 注入全局 WebSocket（mqtt.js 用）
const g = globalThis as unknown as { WebSocket: unknown };
if (!g.WebSocket) g.WebSocket = WxWebSocket;

// === MQTT 订阅 ===
const MQTT_WS_URL = 'wss://rd133da1.ala.cn-hangzhou.emqxsl.cn:8084/mqtt';
const MQTT_USERNAME = 'q63e1fdf';
const MQTT_PASSWORD = 'Wiix3k.9mseAFK_Q';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let client: any = null;

/** 订阅每日 AI 简报推送（qmwx/{userId}/daily-report）*/
export function subscribeDailyReport(userId: string, onMessage: (report: unknown) => void) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mqttMod = require('../../miniprogram_npm/mqtt.js');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Mqtt: any = mqttMod.default || mqttMod;
    client = Mqtt.connect(MQTT_WS_URL, {
      username: MQTT_USERNAME,
      password: MQTT_PASSWORD,
      clientId: 'qmwx_' + userId + '_' + Date.now(),
      connectTimeout: 5000,
      reconnectPeriod: 0,
    });
    client.on('connect', () => {
      client.subscribe(`qmwx/${userId}/daily-report`);
    });
    client.on('message', (_topic: string, payload: Uint8Array) => {
      try {
        const json = String.fromCharCode.apply(null, Array.from(payload) as number[]);
        const report = JSON.parse(json);
        onMessage(report);
      } catch {
        // 解析失败忽略
      }
    });
    client.on('error', () => {
      // 连接错误静默（前端走 API 兜底）
    });
  } catch {
    // mqtt.js 加载失败静默（API 拉兜底）
  }
}

/** 退订（onUnload）*/
export function unsubscribeDailyReport() {
  if (client) {
    try {
      client.end();
    } catch {
      // ignore
    }
    client = null;
  }
}
