/**
 * 设备品牌元数据（V0.1.25，参考图 2770）
 *
 * 前后端共用：后端 device.myBindings 返回、小程序设备绑定页展示。
 * 绑定方式：ble(蓝牙直连) / oauth(厂商授权) / werun(微信运动)
 *
 * 设计意图：品牌列表只在此一处定义（DRY），后端按 vendor 关联 DeviceBinding，
 * 前端按 category 分组渲染。
 */

export type DeviceCategory = 'bracelet' | 'watch' | 'strap' | 'app';
export type DeviceConnectionType = 'ble' | 'oauth' | 'werun';

export interface DeviceBrand {
  /** 唯一标识（对应 DeviceBinding.vendor） */
  key: string;
  /** 中文展示名 */
  name: string;
  category: DeviceCategory;
  connectionType: DeviceConnectionType;
  /** 是否当前可绑定（false = 敬请期待，前端 feature-gate 占位） */
  available: boolean;
  /** 一句话描述 */
  desc: string;
}

/**
 * 设备品牌清单（按设计稿 2770 + schema vendor 枚举对齐）
 *
 * MVP 可用（available=true）：ble(通用蓝牙直连) / garmin(已有佳明数据) / werun(微信运动)
 * 其余品牌占位"敬请期待"——等厂商 OAuth 资质到位后逐个开放
 */
export const DEVICE_BRANDS: DeviceBrand[] = [
  // ===== 蓝牙直连（标准 BLE 心率服务 0x180D，通用）=====
  {
    key: 'ble',
    name: '蓝牙心率设备',
    category: 'strap',
    connectionType: 'ble',
    available: true,
    desc: '蓝牙手环 / 心率带 / 智能手表（标准 BLE 心率服务）',
  },
  // ===== 品牌手表（OAuth 厂商授权）=====
  {
    key: 'garmin',
    name: '佳明 GARMIN',
    category: 'watch',
    connectionType: 'oauth',
    available: true,
    desc: 'Forerunner / Fenix 系列（BLE 实时心率 + OAuth 历史数据）',
  },
  {
    key: 'coros',
    name: '高驰 COROS',
    category: 'watch',
    connectionType: 'ble',
    available: true,
    desc: 'PACE / APEX / VERTIX 系列（BLE 实时心率 + FIT 文件导入历史）',
  },
  {
    key: 'huawei',
    name: '华为运动健康',
    category: 'watch',
    connectionType: 'oauth',
    available: false,
    desc: '华为手表 / 手环',
  },
  {
    key: 'suunto',
    name: '颂拓 Suunto',
    category: 'watch',
    connectionType: 'oauth',
    available: false,
    desc: 'Suunto 9 / 5 系列（含海外用户绑定）',
  },
  // ===== 手环 =====
  {
    key: 'xiaomi',
    name: '小米手环',
    category: 'bracelet',
    connectionType: 'ble',
    available: true,
    desc: 'Mi Band 系列（BLE 心率 + 电量）',
  },
  {
    key: 'honor',
    name: '荣耀手环',
    category: 'bracelet',
    connectionType: 'ble',
    available: false,
    desc: '荣耀手环系列',
  },
  // ===== 健康 App =====
  {
    key: 'werun',
    name: '微信运动',
    category: 'app',
    connectionType: 'werun',
    available: true,
    desc: '同步 30 天步数',
  },
  {
    key: 'zepp',
    name: '欢太健康',
    category: 'app',
    connectionType: 'oauth',
    available: false,
    desc: '欢太 / Zepp 健康 App',
  },
];

/**
 * BLE 设备名品牌识别规则（V0.1.33，参考图 2770）
 *
 * 用于扫描结果自动识别品牌（佳明手表 / 小米手环）。
 * 设备广播名按正则匹配；未中返 'ble'（通用蓝牙），前端弹手选兜底。
 * 连接后读 0x180A Manufacturer Name String 二次验证（更权威）。
 *
 * 单一数据源：前后端共用（前端扫描识别 + 后端 vendor 校验）。
 */
export const BLE_VENDOR_PATTERNS: Record<string, RegExp[]> = {
  garmin: [/garmin/i, /forerunner/i, /fenix/i, /vivoactive/i, /edge/i],
  xiaomi: [/mi\s*band/i, /xiaomi/i, /小米/i, /redmi/i],
  coros: [/coros/i, /pace\s*\d/i, /apex/i, /vertix/i, /dura/i],
};

/** BLE 品牌识别 type（对应 DeviceBinding.vendor） */
export type BleVendor = 'ble' | 'garmin' | 'xiaomi' | 'coros';

/**
 * 按设备名识别 BLE 品牌
 *
 * @param name 设备广播名（如 "Forerunner 245"、"Mi Band 7"、"COROS PACE 3"）
 * @returns 'garmin' | 'xiaomi' | 'coros' | 'ble'（未识别，前端弹手选）
 */
export function matchBleVendor(name: string): BleVendor {
  for (const [vendor, patterns] of Object.entries(BLE_VENDOR_PATTERNS)) {
    if (patterns.some((re) => re.test(name))) {
      return vendor as BleVendor;
    }
  }
  return 'ble';
}

/** 按分类分组的中文标签（前端 Tab 用） */
export const DEVICE_CATEGORY_LABEL: Record<DeviceCategory, string> = {
  bracelet: '手环',
  watch: '手表',
  strap: '心率带',
  app: '健康 App',
};

/**
 * 数据导入图文指南（V0.1.43，按品牌，首页「数据导入指南」页单一数据源）
 *
 * 每品牌：国内源链接（复制去浏览器打开）+ 步骤[]（文字 + 截图路径）+ 跳转 action。
 * 截图路径约定：/images/import-guide/{brand}-{n}.png（前端补图后自动渲染，缺省灰色占位）。
 */
export interface ImportStep {
  text: string;
  shot?: string; // 截图路径（/images/import-guide/xxx.png），缺省无图
}

export interface ImportGuideConfig {
  sourceLabel: string; // 国内源展示名
  sourceUrl?: string; // 国内源链接（可复制，去浏览器打开）
  steps: ImportStep[];
  action: { label: string; url?: string; available: boolean }; // 跳转按钮（available=false 敬请期待）
}

export const IMPORT_GUIDE: Record<string, ImportGuideConfig> = {
  garmin: {
    sourceLabel: '佳明中国 connect.garmin.cn',
    sourceUrl: 'https://connect.garmin.cn',
    steps: [
      { text: '登录佳明中国官网，进入「账户」→ 导出活动数据包（ZIP）', shot: '/images/import-guide/garmin-1.png' },
      { text: '在小程序「佳明数据处理」页上传数据包，自动导入榜单', shot: '/images/import-guide/garmin-2.png' },
    ],
    action: { label: '去导入佳明数据', url: '/pages/garmin-data/index', available: true },
  },
  xiaomi: {
    sourceLabel: '小米账号 隐私中心',
    sourceUrl: 'https://account.xiaomi.com',
    steps: [
      { text: '登录小米账号 → 隐私中心 →「查阅和管理您的数据」', shot: '/images/import-guide/xiaomi-1.png' },
      { text: '选择「MI Fitness 小米运动健康」→ 下载（密码 = ZIP 解压密码，记牢）', shot: '/images/import-guide/xiaomi-2.png' },
      { text: '等邮件通知 → 下载 ZIP → 发到微信「文件传输助手」→ 点下方按钮上传', shot: '/images/import-guide/xiaomi-3.png' },
    ],
    action: { label: '上传小米数据包', available: true },
  },
  werun: {
    sourceLabel: '微信运动（手机内置）',
    steps: [
      { text: '微信 → 关注「微信运动」公众号 → 开启步数', shot: '/images/import-guide/werun-1.png' },
      { text: '设备绑定页 →「同步微信运动」（自动拉取 30 天步数）', shot: '/images/import-guide/werun-2.png' },
    ],
    action: { label: '去同步微信运动', url: '/pages/device-bind/index', available: true },
  },
  ble: {
    sourceLabel: '蓝牙 BLE 直连（标准协议）',
    steps: [
      { text: '手环设置 → 蓝牙 →「心率广播」→ 开启', shot: '/images/import-guide/ble-1.png' },
      { text: '设备绑定页 → 扫描绑定（佳明手表 / 小米手环 10+ 走标准协议）', shot: '/images/import-guide/ble-2.png' },
    ],
    action: { label: '去扫描绑定', url: '/pages/device-bind/index', available: true },
  },
  huawei: {
    sourceLabel: '华为运动健康',
    steps: [{ text: '敬请期待（华为运动健康 API 申请中）' }],
    action: { label: '敬请期待', available: false },
  },
  honor: {
    sourceLabel: '荣耀手环',
    steps: [{ text: '敬请期待（荣耀手环 API 申请中）' }],
    action: { label: '敬请期待', available: false },
  },
  coros: {
    sourceLabel: '高驰 COROS App',
    steps: [
      { text: 'COROS App → 活动历史 → 选活动 → 导出 FIT 文件', shot: '/images/import-guide/coros-1.png' },
      { text: '发 FIT 到微信「文件传输助手」→ 点下方按钮上传导入统一榜', shot: '/images/import-guide/coros-2.png' },
      { text: '实时心率：设备绑定页 → 高驰 → 扫描连接（心率广播模式）', shot: '/images/import-guide/coros-3.png' },
      { text: 'Terra 自动同步：联系客服开通后，活动数据自动同步（免手动上传 FIT）', shot: '/images/import-guide/coros-4.png' },
    ],
    action: { label: '上传 COROS FIT 文件', available: true },
  },
  suunto: {
    sourceLabel: '颂拓 Suunto',
    steps: [{ text: '敬请期待（颂拓 API 申请中）' }],
    action: { label: '敬请期待', available: false },
  },
  zepp: {
    sourceLabel: '欢太健康',
    steps: [{ text: '敬请期待（Zepp Life API 申请中）' }],
    action: { label: '敬请期待', available: false },
  },
};
