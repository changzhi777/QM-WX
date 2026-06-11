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
    updateProfile: '/api/user',
    bindApps: '/api/user',
  },
  sport: {
    checkin: '/api/sport',
    myStats: '/api/sport',
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
  },
} as const;
