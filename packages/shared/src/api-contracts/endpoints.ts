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
  // 生产：小程序 release/trial 版走企业官网共用域名（备案 + HTTPS + nginx /api/ 反代已就位）
  // 详见 memory/deploy-prod-qingmulife.md
  prod: 'https://qingmulife.cn',
} as const;

export const ENDPOINTS = {
  user: {
    login: '/api/user',
    me: '/api/user',
    updateProfile: '/api/user',
    bindApps: '/api/user',
    completeOnboarding: '/api/user', // V0.1.43 完成激活向导
    resetOnboarding: '/api/user', // V0.1.44 重新激活（重走向导）
  },
  auth: {
    login: '/api/auth/login', // V0.1.129 统一登录入口（method + payload dispatch）
    refresh: '/api/auth/refresh',
    sendSms: '/api/auth/send-sms', // V0.1.129 短信验证码
    sendMail: '/api/auth/send-mail', // V0.1.129 邮件（预留）
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
    groupDetail: '/api/sport', // V0.1.42 群详情+公告+汇总
    groupMembers: '/api/sport', // V0.1.42 成员列表含本月跑量
    announceGroup: '/api/sport', // V0.1.42 owner 发公告
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
    myEnrollments: '/api/content',
    // V0.1.134 赛事成绩
    submitRaceResult: '/api/content',
    getRaceLeaderboard: '/api/content',
    getMyRaceResult: '/api/content',
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
    // 训练计划管理（V0.1.41）
    upsertTrainingPlan: '/api/admin',
    listTrainingPlans: '/api/admin',
    // V0.1.134 赛事成绩 admin 录入
    submitRaceResult: '/api/admin',
    listEnrollmentsByContent: '/api/admin',
  },
  device: {
    listBindings: '/api/device',
    startOAuth: '/api/device',
    unbind: '/api/device',
    syncWeRun: '/api/device',
    myWeRun: '/api/device', // V0.1.43 微信运动历史步数（日期范围）
    submitHeartRate: '/api/device',
    submitSpO2: '/api/device', // V0.1.43 血氧上传（BLE 0x1822 / 0x2A5F）
    submitBodyComposition: '/api/device', // V0.1.124 体脂秤数据上传（BLE 小米体脂秤 0x181B/0x181D）
    myHealthHistory: '/api/device', // V0.1.43 心率/血氧历史（type + dateRange 分页）
    uploadXiaomiZip: '/api/device/uploadXiaomiZip', // V0.1.43 小米数据包上传（multipart ZIP）
    uploadCorosFit: '/api/device/uploadCorosFit', // V0.1.129 COROS FIT 文件上传（multipart）
    // 蓝牙设备绑定（V0.1.25，参考图 2770）
    bindBleDevice: '/api/device',
    myBindings: '/api/device',
    // 佳明数据查询（B-2，2026-07-01）
    myActivities: '/api/device',
    mySleep: '/api/device',
    myMetrics: '/api/device',
    myFitnessAge: '/api/device',
    // 今日健康看板聚合（V0.1.25，参考图 2774）
    myTodayHealth: '/api/device',
    // 佳明数据处理（导入榜单，2026-07-01）
    myPending: '/api/device',
    myProcessed: '/api/device',
    ignoreActivity: '/api/device',
    importToCheckin: '/api/device',
    // V0.1.130 COROS Terra 聚合（授权 + 手动拉历史；webhook 走 /api/device/terra-webhook public）
    corosAuthUrl: '/api/device',
    syncFromTerra: '/api/device',
  },
  stats: {
    myRunnerStats: '/api/stats',
    myAnnualReport: '/api/stats',
    myCertificates: '/api/stats',
  },
  ranking: {
    groupRankingMulti: '/api/ranking',
  },
  cart: {
    add: '/api/cart',
    remove: '/api/cart',
    list: '/api/cart',
    updateQty: '/api/cart',
    clear: '/api/cart',
  },
  points: {
    myBalance: '/api/points',
    signin: '/api/points',
    myTasks: '/api/points',
  },
  address: {
    list: '/api/address',
    create: '/api/address',
    update: '/api/address',
    remove: '/api/address',
    setDefault: '/api/address',
  },
  coupon: {
    templates: '/api/coupon',
    myCoupons: '/api/coupon',
    availableCount: '/api/coupon',
    receive: '/api/coupon',
  },
  distribution: {
    mySummary: '/api/distribution',
    myOrders: '/api/distribution',
    myTeam: '/api/distribution',
    myCommissionLogs: '/api/distribution',
    myLevel: '/api/distribution',
    inviteInfo: '/api/distribution',
  },
  training: {
    myPlans: '/api/training',
    mySportRecords: '/api/training',
    joinPlan: '/api/training', // V0.1.41 加入训练计划（1 人 1 活跃，upsert 替换）
    myActivePlan: '/api/training', // V0.1.41 当前计划 + 进度（joinedAt 起 Checkin run 累计 / targetKm）
    leavePlan: '/api/training', // V0.1.41 离开计划（deleteMany 幂等）
  },
  shoes: {
    list: '/api/shoes',
    add: '/api/shoes',
    update: '/api/shoes',
    retire: '/api/shoes',
    myStats: '/api/shoes',
    // V0.1.133 增强
    getDetail: '/api/shoes',
    getMileageHistory: '/api/shoes',
    updateThreshold: '/api/shoes',
  },
  goal: {
    list: '/api/goal',
    add: '/api/goal',
    remove: '/api/goal',
    myProgress: '/api/goal',
    addFamilyGoal: '/api/goal',
    myFamilyGoals: '/api/goal',
    // V0.1.135 自定义里程碑
    addCustomMilestone: '/api/goal',
    removeCustomMilestone: '/api/goal',
    listCustomMilestones: '/api/goal',
    checkMilestoneAchievement: '/api/goal',
  },
  favorite: {
    list: '/api/favorite',
    add: '/api/favorite',
    remove: '/api/favorite',
    isFavorited: '/api/favorite',
  },
  feed: {
    list: '/api/feed',
    myFeeds: '/api/feed',
    publish: '/api/feed',
    like: '/api/feed',
    unlike: '/api/feed',
    comment: '/api/feed',
    hotTopics: '/api/feed',
  },
  notification: {
    list: '/api/notification',
    unreadCount: '/api/notification',
    markRead: '/api/notification',
    markAllRead: '/api/notification',
  },
  follow: {
    follow: '/api/follow',
    unfollow: '/api/follow',
    isFollowing: '/api/follow',
    myFollowing: '/api/follow',
    myFollowers: '/api/follow',
    myCounts: '/api/follow',
  },
  family: {
    createFamily: '/api/family',
    joinFamily: '/api/family',
    myFamily: '/api/family',
    leaveFamily: '/api/family',
    familyRanking: '/api/family',
    inviteInfo: '/api/family',
    transferOwner: '/api/family',
    dissolveFamily: '/api/family',
    familyAchievements: '/api/family',
  },
  groupBuy: {
    list: '/api/group-buy',
    detail: '/api/group-buy',
    join: '/api/group-buy',
    myJoined: '/api/group-buy',
  },
  review: {
    create: '/api/review',
    list: '/api/review',
    stats: '/api/review',
    myReviews: '/api/review',
    remove: '/api/review',
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
