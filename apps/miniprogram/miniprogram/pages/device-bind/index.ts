// pages/device-bind/index.ts — 设备绑定中心（参考图 2770；V0.1.33 品牌识别 + 多服务读取）
import { api } from '../../services/api';
import {
  openBleAdapter,
  scanBleDevices,
  connectDevice,
  disconnectDevice,
  subscribeHeartRate,
  readBattery,
  readDeviceInfo,
  readSpO2SpotCheck,
  readBodySensorLocation,
  getDeviceServices,
  closeBleAdapter,
  type BleDevice,
} from '../../utils/ble';
import {
  connectScale,
  subscribeScaleData,
  disconnectScale,
  matchScaleVendor,
  calcBodyComposition,
} from '../../utils/scale';
import { DEVICE_CATEGORY_LABEL, matchBleVendor, type DeviceBrand } from '@qm-wx/shared';

/** 扫描结果项（V0.1.33 加品牌识别字段） */
interface FoundDevice extends BleDevice {
  detectedBrand: string; // 'garmin' | 'xiaomi' | 'ble'
  brandLabel: string; // 中文标签（佳明/小米/通用）
}

/** 品牌中文标签（与 matchBleVendor 对应） */
const BRAND_LABEL: Record<string, string> = {
  garmin: '佳明',
  xiaomi: '小米',
  ble: '通用',
};

interface Binding {
  id: string;
  vendor: string;
  deviceName: string;
  status: string;
  lastSyncAt: string | null;
  createdAt: string;
}

interface MyBindingsRes {
  brands: DeviceBrand[];
  bindings: Binding[];
  garminBleBound: boolean;
  garminAutoConnected: boolean;
  garminActivityCount: number;
}

/** 品牌卡用的展示类型（带分类中文标签） */
type BrandCard = DeviceBrand & { _categoryLabel: string };

Page({
  data: {
    brands: [] as BrandCard[],
    bindings: [] as Binding[],
    garminBleBound: false,
    garminAutoConnected: false,
    garminActivityCount: 0,
    loading: false,
    // 蓝牙扫描流程
    scanVisible: false,
    scanning: false,
    foundDevices: [] as FoundDevice[],
    connecting: false,
    // 实时心率 + 设备信息（V0.1.33 多服务读取）
    liveHr: null as number | null,
    liveBattery: null as number | null,
    liveModel: null as string | null,
    liveManufacturer: null as string | null,
    liveSpO2: null as { spo2: number; pr: number } | null,
    liveBodyLocation: null as string | null,
    // V0.1.43 心率批量上传缓冲 + 定时器（10s flush，避免高频请求）
    hrBuffer: [] as { hr: number; ts: number }[],
    hrUploadTimer: null as ReturnType<typeof setInterval> | null,
    boundBleDeviceId: '' as string,
    // 蓝牙联调辅助（GAP-9，真机调试可观测性）
    debugVisible: false,
    debugLog: [] as string[],
    hrCount: 0,
    // V0.1.124 体脂秤
    liveScale: null as { weight: number; bodyFat?: number; bmi?: number; muscle?: number; bone?: number; water?: number; visceralFat?: number; impedance?: number; stabilized: boolean } | null,
    scaleConnected: false,
    // V0.1.43 微信运动步数（方案 3）
    werunRecords: [] as { date: string; step: number; km: number }[],
    werunSummary: { totalSteps: 0, totalKm: 0, days: 0 } as { totalSteps: number; totalKm: number; days: number },
  },

  onShow() {
    this.loadBindings();
    this.loadWeRun(); // V0.1.43 微信运动步数
  },

  onHide() {
    // 离开页面前 flush 残留心率（防数据丢）+ 停定时器 + 释放蓝牙
    this.uploadHrBuffer();
    this.stopHrUpload();
    closeBleAdapter();
  },

  onUnload() {
    this.uploadHrBuffer();
    this.stopHrUpload();
  },

  /** 拉取品牌列表 + 已绑设备（device.myBindings） */
  async loadBindings() {
    this.setData({ loading: true });
    try {
      const res = await api.call<MyBindingsRes>('device', 'myBindings', {});
      const boundBle = res.bindings.find((b) => b.vendor === 'ble' || b.vendor === 'garmin' || b.vendor === 'xiaomi');
      this.setData({
        brands: res.brands.map((b) => ({
          ...b,
          _categoryLabel: DEVICE_CATEGORY_LABEL[b.category],
        })),
        bindings: res.bindings,
        garminBleBound: res.garminBleBound,
        garminAutoConnected: res.garminAutoConnected,
        garminActivityCount: res.garminActivityCount,
        loading: false,
      });
      if (boundBle) {
        this.setData({ boundBleDeviceId: boundBle.deviceName });
      }
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 点品牌卡 — V0.1.33：ble/garmin/xiaomi 走 BLE 扫描；werun 提示；其他敬请期待 */
  onTapBrand(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    const brand = this.data.brands.find((b) => b.key === key);
    if (!brand) return;
    if (!brand.available) {
      wx.showToast({ title: '敬请期待', icon: 'none' });
      return;
    }
    // V0.1.33：ble/garmin/xiaomi 都走蓝牙扫描（garmin 也支持 BLE 实时心率绑定）
    if (brand.connectionType === 'ble' || brand.key === 'garmin' || brand.key === 'xiaomi') {
      this.startScan();
    } else if (brand.key === 'werun') {
      wx.showToast({ title: '微信运动同步开发中', icon: 'none' });
    }
  },

  /** 开始蓝牙扫描（V0.1.42 无过滤扫描 + 品牌识别筛选）*/
  async startScan() {
    this.setData({ scanVisible: true, scanning: true, foundDevices: [], liveHr: null, hrCount: 0 });
    this.pushLog('开启蓝牙适配器...');
    try {
      await openBleAdapter();
      this.pushLog('✓ 适配器已开，扫描中（5s，无过滤）...');
      const devices = await scanBleDevices(5000);
      // V0.1.42：扫所有 BLE 设备 + 品牌识别筛选（小米手环不广播 0x180D，需无过滤扫描）
      const enriched: FoundDevice[] = devices
        .filter((d) => d.name && d.name !== '未知设备') // 过滤空名/未命名设备
        .map((d) => {
          const detectedBrand = matchBleVendor(d.name);
          const isScale = matchScaleVendor(d.name);
          return { ...d, detectedBrand: isScale ? 'mi_scale' : detectedBrand, brandLabel: isScale ? '体脂秤' : (BRAND_LABEL[detectedBrand] ?? '通用') };
        })
        .sort((a, b) => {
          // 品牌命中的排前（garmin/xiaomi 优先于 ble 通用）
          const score = (v: string) => (v === 'ble' ? 1 : 0);
          return score(a.detectedBrand) - score(b.detectedBrand);
        });
      this.setData({ foundDevices: enriched, scanning: false });
      const identified = enriched.filter((d) => d.detectedBrand !== 'ble').length;
      this.pushLog(`扫描完成，发现 ${enriched.length} 个设备（品牌识别 ${identified} 个）`);
      if (enriched.length === 0) {
        wx.showToast({ title: '未发现蓝牙心率设备', icon: 'none' });
      }
    } catch (e) {
      this.setData({ scanning: false });
      const msg = (e as Error).message || '扫描失败';
      this.pushLog(`✗ ${msg}`);
      wx.showToast({ title: msg, icon: 'none' });
    }
  },

  /** 选中扫描到的设备 → 连接 + 读电量/设备信息 + 品牌识别 + 订阅心率 + 绑定后端 */
  async onSelectDevice(e: WechatMiniprogram.TouchEvent) {
    const device = e.currentTarget.dataset.device as FoundDevice;
    if (this.data.connecting) return;
    this.setData({ connecting: true });
    wx.showLoading({ title: '连接中...' });
    this.pushLog(`连接 ${device.name}...`);

    // V0.1.124 体脂秤走独立流程（connectScale 自动检测 0x181B/0x181D）
    if (device.detectedBrand === 'mi_scale' || matchScaleVendor(device.name)) {
      return this.connectScaleDevice(device);
    }

    try {
      await connectDevice(device.deviceId);
      this.pushLog('✓ 已连接，读取电量/设备信息...');

      // V0.1.42：查服务列表（诊断小米手环支持哪些服务，决定心率策略）
      // V0.1.43：hasHr 提到外层 — 不支持 0x180D 时直接跳过标准订阅（避免无效重试）
      let hasHr = false;
      let hasSpO2 = false;
      try {
        const services = await getDeviceServices(device.deviceId);
        const sl = services.map((s) => s.replace(/-/g, '').toLowerCase());
        hasHr = sl.some((s) => s.includes('180d'));
        hasSpO2 = sl.some((s) => s.includes('1822'));
        const hasMi = sl.some((s) => s.includes('fee0') || s.includes('fee1'));
        const hasBat = sl.some((s) => s.includes('180f'));
        const hasInfo = sl.some((s) => s.includes('180a'));
        this.pushLog(
          `服务 ${services.length} 个 | 心率0x180D ${hasHr ? '✓' : '✗'} | 血氧0x1822 ${hasSpO2 ? '✓' : '✗'} | 小米0xFEE0 ${hasMi ? '✓' : '✗'} | 电量0x180F ${hasBat ? '✓' : '✗'} | 设备信息0x180A ${hasInfo ? '✓' : '✗'}`,
        );
        // V0.1.43 全量服务短码（诊断 10 Pro 完整能力，决策依据）
        this.pushLog(`服务全集: ${services.map((s) => s.replace(/-/g, '').slice(4, 8)).join(', ')}`);
      } catch (e) {
        this.pushLog(`⚠ 获取服务列表失败：${(e as Error).message}`);
      }

      // V0.1.33 读电量 + 设备信息；V0.1.43 加体感位置（0x2A38）
      const [battery, deviceInfo, bodyLocation] = await Promise.all([
        readBattery(device.deviceId),
        readDeviceInfo(device.deviceId),
        readBodySensorLocation(device.deviceId),
      ]);
      this.pushLog(
        `电量 ${battery ?? '?'}% · 厂商 ${deviceInfo.manufacturer ?? '未知'} · 型号 ${deviceInfo.model ?? '未知'} · 佩戴 ${bodyLocation ?? '?'}`,
      );
      if (bodyLocation) this.setData({ liveBodyLocation: bodyLocation });

      // V0.1.33 品牌识别：扫描时识别 + manufacturer 二次验证 + 手选兜底
      let vendor = device.detectedBrand as 'ble' | 'garmin' | 'xiaomi';
      if (vendor === 'ble' && deviceInfo.manufacturer) {
        // 设备名未识别，用 0x180A Manufacturer Name 二次验证（权威字段）
        const byMfg = matchBleVendor(deviceInfo.manufacturer);
        if (byMfg !== 'ble') vendor = byMfg;
      }
      if (vendor === 'ble') {
        // 仍未识别 → 手选兜底
        wx.hideLoading();
        const choice = await this.askBrandSelect();
        if (!choice) {
          await disconnectDevice(device.deviceId);
          this.setData({ connecting: false });
          return;
        }
        vendor = choice;
        wx.showLoading({ title: '订阅心率...' });
      }

      this.pushLog(`品牌识别：${vendor}，订阅心率服务...`);
      // V0.1.43：基于 hasHr 决定订阅策略（小米手环无 0x180D，盲目订阅浪费 3s 重试超时）
      let hrSubscribed = false;
      if (!hasHr) {
        this.pushLog(
          `⚠ ${BRAND_LABEL[vendor] || vendor} 不支持标准心率服务 0x180D（小米用私有 0xFEE0），心率订阅跳过`,
        );
      } else {
        try {
          await subscribeHeartRate(device.deviceId, (hr) => {
            this.setData({ liveHr: hr, hrCount: this.data.hrCount + 1 });
            // V0.1.43 累积心率采样，定时批量上传后端（避免高频请求）
            const buf = [...this.data.hrBuffer, { hr, ts: Date.now() }].slice(-100);
            this.setData({ hrBuffer: buf });
            // 首次心率立即上传（确保心率尽快入库，首页 onShow 能查到 — A 修复）
            if (buf.length === 1) this.uploadHrBuffer();
          });
          hrSubscribed = true;
          this.pushLog('✓ 心率订阅成功');
          // V0.1.43 启动定时上传（10s 批量 flush）
          this.startHrUpload();
        } catch (hrErr) {
          this.pushLog(`⚠ 心率订阅失败（重试 3 次仍失败）：${(hrErr as Error).message}`);
        }
      }

      // V0.1.43 血氧读取（hasSpO2 时订阅，需用户在手环上测血氧触发推送）
      if (hasSpO2) {
        this.pushLog('检测到血氧服务 0x1822，订阅中（请在手环上测血氧）...');
        this.readSpO2(device.deviceId);
      } else {
        this.pushLog('⚠ 未检测到血氧服务 0x1822（小米可能私有，不可得）');
      }

      // 落库绑定（即使心率订阅失败，仍绑定设备 — V0.1.42 容错）
      await api.call('device', 'bindBleDevice', {
        deviceId: device.deviceId,
        name: device.name,
        services: ['0000180D-0000-1000-8000-00805F9B34FB'],
        vendor,
        brandMeta: {
          manufacturer: deviceInfo.manufacturer ?? undefined,
          model: deviceInfo.model ?? undefined,
        },
      });

      wx.hideLoading();
      this.setData({
        connecting: false,
        scanVisible: false,
        boundBleDeviceId: device.deviceId,
        liveBattery: battery,
        liveModel: deviceInfo.model,
        liveManufacturer: deviceInfo.manufacturer,
      });
      wx.showToast({
        title: hrSubscribed ? '绑定成功' : '已绑定（心率暂不可用）',
        icon: hrSubscribed ? 'success' : 'none',
      });
      this.pushLog(`✓ 已绑定（${BRAND_LABEL[vendor]}）`);
      this.loadBindings();
    } catch (e) {
      wx.hideLoading();
      this.setData({ connecting: false });
      wx.showToast({ title: (e as Error).message || '连接失败', icon: 'none' });
    }
  },

  /** V0.1.124 体脂秤连接 + 订阅数据（独立流程） */
  async connectScaleDevice(device: FoundDevice) {
    try {
      const { serviceId, characteristicId, type } = await connectScale(device.deviceId);
      this.pushLog(`✓ 体脂秤已连接，Service ${type === 'body_composition' ? '0x181B（体成分）' : '0x181D（体重）'}`);
      this.setData({ scanVisible: false, connecting: false, scaleConnected: true, boundBleDeviceId: device.deviceId });
      wx.hideLoading();
      wx.showToast({ title: '请站上秤测量', icon: 'none' });

      subscribeScaleData(device.deviceId, serviceId, characteristicId, (data) => {
        // 拿到实时测量数据
        if (data.impedance) {
          // 体成分秤：有阻抗 → 算体成分
          const app = getApp() as { globalData: { user?: { gender?: string; birthday?: string; height?: number } } };
          const u = app.globalData.user;
          const gender = (u?.gender === 'female' ? 'female' : 'male') as 'male' | 'female';
          const height = u?.height ?? 170;
          const age = u?.birthday ? new Date().getFullYear() - parseInt(u.birthday.slice(0, 4)) : 30;
          const bodyData = calcBodyComposition(data, height, gender, age);
          this.setData({
            liveScale: {
              weight: bodyData.weight, bodyFat: bodyData.bodyFat, bmi: bodyData.bmi,
              muscle: bodyData.muscle, bone: bodyData.bone, water: bodyData.water,
              visceralFat: bodyData.visceralFat, impedance: bodyData.impedance,
              stabilized: data.stabilized,
            },
          });
        } else {
          // 体重秤：只显示体重
          this.setData({ liveScale: { weight: data.weight, stabilized: data.stabilized } });
        }
      }, (err) => {
        this.pushLog(`⚠ 秤数据订阅失败: ${err.errMsg}`);
      });
    } catch (e) {
      wx.hideLoading();
      this.setData({ connecting: false });
      wx.showToast({ title: (e as Error).message || '体脂秤连接失败', icon: 'none' });
    }
  },

  /** V0.1.124 保存体脂秤数据（调 device.submitBodyComposition） */
  async onSaveScaleData() {
    const scale = this.data.liveScale;
    if (!scale || !scale.stabilized) {
      wx.showToast({ title: '请等待体重稳定', icon: 'none' });
      return;
    }
    try {
      await api.call('device', 'submitBodyComposition', {
        weight: scale.weight,
        bodyFat: scale.bodyFat,
        bmi: scale.bmi,
        muscle: scale.muscle,
        bone: scale.bone,
        water: scale.water,
        visceralFat: scale.visceralFat,
        impedance: scale.impedance,
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      // 断开连接
      if (this.data.boundBleDeviceId) {
        await disconnectScale(this.data.boundBleDeviceId);
        this.setData({ scaleConnected: false, liveScale: null, boundBleDeviceId: '' });
      }
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '保存失败', icon: 'none' });
    }
  },

  /** V0.1.33 手选品牌兜底（设备名 + manufacturer 都未识别时） */
  askBrandSelect(): Promise<'ble' | 'garmin' | 'xiaomi' | null> {
    return new Promise((resolve) => {
      wx.showActionSheet({
        itemList: ['佳明手表', '小米手环', '通用蓝牙设备'],
        success: (res) => {
          const map = ['garmin', 'xiaomi', 'ble'] as const;
          resolve(map[res.tapIndex] ?? null);
        },
        fail: () => resolve(null),
      });
    });
  },

  /** 推一条调试日志（最多保留 20 条，GAP-9 联调可观测性） */
  pushLog(msg: string) {
    const time = new Date().toTimeString().slice(0, 8);
    const log = [...this.data.debugLog, `[${time}] ${msg}`].slice(-20);
    this.setData({ debugLog: log });
  },

  /** V0.1.43 启动心率定时上传（5s 批量 flush，平衡实时性与请求频次）*/
  startHrUpload() {
    this.stopHrUpload();
    const timer = setInterval(() => this.uploadHrBuffer(), 5000);
    this.setData({ hrUploadTimer: timer });
  },

  /** V0.1.43 停止心率定时上传 */
  stopHrUpload() {
    if (this.data.hrUploadTimer) {
      clearInterval(this.data.hrUploadTimer);
      this.setData({ hrUploadTimer: null });
    }
  },

  /** V0.1.43 批量上传心率缓冲（flush 后立即清空；成功后存本地缓存供首页秒开）*/
  async uploadHrBuffer() {
    const samples = this.data.hrBuffer;
    if (samples.length === 0) return;
    this.setData({ hrBuffer: [] });
    try {
      await api.call('device', 'submitHeartRate', { samples });
      const latest = samples[samples.length - 1];
      this.cacheHealth('hr', { value: latest.hr, timestamp: new Date(latest.ts).toISOString() });
    } catch {
      // 失败丢弃（实时心率非关键历史，YAGNI 不重试）
    }
  },

  /** V0.1.43 健康数据存本地（首页秒开 + 离线可看）*/
  cacheHealth(key: string, value: unknown) {
    try {
      const cached = (wx.getStorageSync('todayHealth') as Record<string, unknown>) || {};
      cached[key] = value;
      cached.lastUpdate = Date.now();
      wx.setStorageSync('todayHealth', cached);
    } catch {
      // 静默（缓存失败不阻塞）
    }
  },

  /** V0.1.43 读血氧（订阅 0x2A5F，等用户在手环测血氧推送；30s 超时）*/
  async readSpO2(deviceId: string) {
    try {
      const result = await readSpO2SpotCheck(deviceId, 30000);
      if (result) {
        this.setData({ liveSpO2: result });
        this.pushLog(`✓ 血氧 ${result.spo2}% · 脉率 ${result.pr}`);
        try {
          await api.call('device', 'submitSpO2', { value: result.spo2 });
          this.cacheHealth('spo2', { value: result.spo2, timestamp: new Date().toISOString() });
        } catch {
          // 上传失败静默
        }
      } else {
        this.pushLog('⚠ 血氧测量超时（30s 未推送，请确认手环已测血氧）');
      }
    } catch (e) {
      this.pushLog(`⚠ 血氧读取失败：${(e as Error).message}`);
    }
  },

  /** V0.1.43 同步微信运动步数（wx.getWeRunData → 后端 session_key 解密入库）*/
  async onSyncWeRun() {
    wx.showLoading({ title: '同步中...' });
    try {
      const res = await new Promise<WechatMiniprogram.GetWeRunDataSuccessCallbackResult>((resolve, reject) => {
        wx.getWeRunData({ success: resolve, fail: reject });
      });
      const result = await api.call<{ synced: number; days: number }>('device', 'syncWeRun', {
        encryptedData: res.encryptedData,
        iv: res.iv,
      });
      wx.hideLoading();
      wx.showToast({ title: `同步 ${result.synced} 条`, icon: 'success' });
      this.loadWeRun();
    } catch (err) {
      wx.hideLoading();
      const msg = (err as Error).message || '同步失败';
      if (msg.includes('auth') || msg.includes('deny') || msg.includes('authorize')) {
        wx.showModal({
          title: '需授权微信运动',
          content: '请在设置中开启"微信运动"权限以读取步数',
          confirmText: '去设置',
          success: (r) => r.confirm && wx.openSetting({}),
        });
      } else {
        wx.showToast({ title: msg, icon: 'none' });
      }
    }
  },

  /** V0.1.43 加载微信运动历史（最近 30 天）*/
  async loadWeRun() {
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86400 * 1000);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const res = await api.call<{
        records: { date: string; step: number; km: number }[];
        totalSteps: number; totalKm: number; days: number;
      }>('device', 'myWeRun', { startDate: fmt(start), endDate: fmt(end) });
      this.setData({
        werunRecords: res.records.slice().reverse(),
        werunSummary: { totalSteps: res.totalSteps, totalKm: res.totalKm, days: res.days },
      });
    } catch {
      // 静默（未同步时无数据）
    }
  },

  /** 折叠/展开调试面板 */
  toggleDebug() {
    this.setData({ debugVisible: !this.data.debugVisible });
  },

  /** 关闭扫描弹层 */
  closeScan() {
    this.setData({ scanVisible: false });
    if (this.data.scanning) {
      closeBleAdapter();
      this.setData({ scanning: false });
    }
  },

  /** 解绑设备 */
  onUnbind(e: WechatMiniprogram.TouchEvent) {
    const vendor = e.currentTarget.dataset.vendor as string;
    const deviceName = e.currentTarget.dataset.name as string;
    wx.showModal({
      title: '解绑设备',
      content: `确定解绑「${deviceName}」吗？`,
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('device', 'unbind', { vendor });
          if (
            (vendor === 'ble' || vendor === 'garmin' || vendor === 'xiaomi') &&
            this.data.boundBleDeviceId
          ) {
            await disconnectDevice(this.data.boundBleDeviceId);
            this.setData({
              boundBleDeviceId: '',
              liveHr: null,
              liveBattery: null,
              liveModel: null,
              liveManufacturer: null,
            });
          }
          wx.showToast({ title: '已解绑', icon: 'success' });
          this.loadBindings();
        } catch {
          wx.showToast({ title: '解绑失败', icon: 'none' });
        }
      },
    });
  },
});
