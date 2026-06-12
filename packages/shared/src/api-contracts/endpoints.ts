/**
 * API 端点路径常量
 *
 * 统一在前后端引用，避免硬编码字符串散落各处。
 *
 * 协议：POST /api/{module} body = { action, payload }
 * 但 path 参数（如 /api/mall/product/:id）单独命名
 */

export const API_BASE = {
  dev: 'http://localhost:3000',
  staging: 'https://api-staging.qingmu.example',
  prod: 'https://api.qingmu.example',
} as const;

export const ENDPOINTS = {
  user: {
    login: '/api/user',
    me: '/api/user',
    updateProfile: '/api/user',
    bindApps: '/api/user',
  },
  auth: {
    refresh: '/api/auth/refresh',
  },
  sport: {
    checkin: '/api/sport',
    today: '/api/sport',
    myStats: '/api/sport',
    myGroups: '/api/sport',
    createGroup: '/api/sport',
    joinGroup: '/api/sport',
    quitGroup: '/api/sport',
    groupRanking: '/api/sport',
  },
  mall: {
    listProducts: '/api/mall',
    productDetail: '/api/mall',
    createOrder: '/api/mall',
    myOrders: '/api/mall',
    cancelOrder: '/api/mall',
    listCategories: '/api/mall',
  },
  content: {
    list: '/api/content',
    detail: '/api/content',
    enroll: '/api/content',
  },
  weeklyReport: {
    currentWeek: '/api/weekly-report',
    myReport: '/api/weekly-report',
    trigger: '/api/weekly-report',
  },
  wallet: {
    get: '/api/wallet',
    unifiedOrder: '/api/wallet',
    transactions: '/api/wallet',
  },
  admin: {
    upsertContent: '/api/admin',
    upsertProduct: '/api/admin',
    setConfig: '/api/admin',
    listOrders: '/api/admin',
    updateOrderStatus: '/api/admin',
    listAdmins: '/api/admin',
  },
} as const;

export type EndpointModule = keyof typeof ENDPOINTS;
export type EndpointAction<M extends EndpointModule> = keyof (typeof ENDPOINTS)[M];

/**
 * 取指定 module + action 对应的 URL。
 * 若 action 未在 ENDPOINTS 中定义，开发态下打 console.warn 并 fallback 到 `/api/{module}`。
 *
 * 设计意图：调用方写 `actionUrl('sport', 'checkin')` 而非 `ENDPOINTS.sport`（嵌套对象，
 * 直接拼接 URL 会变 `[object Object]`）。
 */
export function actionUrl<M extends EndpointModule>(
  module: M,
  action: string,
): string {
  const map = ENDPOINTS[module] as Record<string, string>;
  const url = map[action];
  if (url) return url;
  // 开发态早暴露：缺登记说明 ENDPOINTS 未跟上后端
  // 生产仍 fallback 到默认 /api/{module}，保持兼容
  if (typeof console !== 'undefined' && typeof console.warn === 'function') {
    console.warn(
      `[endpoints] action '${module}.${action}' not registered, fallback to /api/${module}`,
    );
  }
  return `/api/${module}`;
}
