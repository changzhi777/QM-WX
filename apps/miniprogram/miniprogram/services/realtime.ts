// services/realtime.ts — 实时通讯（V0.2.116 替 MQTT）
// wx.connectSocket + 后端 /ws（fastify-websocket + Redis pub/sub）+ eventBus 数据层
// 用法：onShow connectRealtime() + onRealtime('dailyReport', cb)；onUnload clearRealtime + disconnectRealtime

const WS_URL = 'wss://qingmulife.cn/ws'; // 生产（nginx /ws proxy → :3000）

let socketTask: WechatMiniprogram.SocketTask | null = null;
let reconnectTimer: number | null = null;
const listeners: Record<string, Set<(data: unknown) => void>> = {};

/** 连接 ws（token 从 globalData，ensureLogin 后设）*/
export function connectRealtime() {
  if (socketTask) return;
  const token = (getApp() as { globalData?: { token?: string } }).globalData?.token;
  if (!token) return;
  socketTask = wx.connectSocket({ url: `${WS_URL}?token=${token}` });
  socketTask.onMessage((res) => {
    try {
      const { type, data } = JSON.parse(res.data as string) as { type: string; data: unknown };
      listeners[type]?.forEach((cb) => { try { cb(data); } catch { /* cb 失败忽略 */ } });
    } catch { /* 非 JSON 忽略 */ }
  });
  socketTask.onClose(() => {
    socketTask = null;
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connectRealtime(); }, 3000) as unknown as number;
  });
  socketTask.onError(() => { /* 错误静默，onClose 会触发重连 */ });
}

/** 订阅事件（数据层 eventBus）*/
export function onRealtime(event: string, cb: (data: unknown) => void) {
  (listeners[event] ?? (listeners[event] = new Set())).add(cb);
}

/** 清某事件所有订阅（onUnload）*/
export function clearRealtime(event: string) {
  listeners[event]?.clear();
}

/** 关闭连接（logout / app 退出）*/
export function disconnectRealtime() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  socketTask?.close({});
  socketTask = null;
}
