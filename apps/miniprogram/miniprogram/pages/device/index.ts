// pages/device/index.ts — 设备中心（V0.1.143 合并 device-bind + garmin-data + data-import-guide）
// 3 tab：绑定（BLE 心率/体脂秤）/ 佳明数据 / 导入指南
import { api } from '../../services/api';
import {
  openBleAdapter, scanBleDevices, connectDevice, disconnectDevice,
  subscribeHeartRate, readBattery, readDeviceInfo, readSpO2SpotCheck,
  readBodySensorLocation, getDeviceServices, closeBleAdapter, type BleDevice,
} from '../../utils/ble';
import {
  connectScale, subscribeScaleData, disconnectScale, matchScaleVendor, calcBodyComposition,
} from '../../utils/scale';
import {
  DEVICE_CATEGORY_LABEL, matchBleVendor, DEVICE_BRANDS, IMPORT_GUIDE, type DeviceBrand,
} from '@qm-wx/shared';
import { ENV } from '../../config/env';

type DeviceTab = 'bind' | 'garmin' | 'import';

// === 绑定 tab ===
interface FoundDevice extends BleDevice {
  detectedBrand: string;
  brandLabel: string;
}

const BRAND_LABEL: Record<string, string> = { garmin: '佳明', xiaomi: '小米', coros: '高驰', ble: '通用' };

interface Binding {
  id: string; vendor: string; deviceName: string; status: string;
  lastSyncAt: string | null; createdAt: string;
}

interface MyBindingsRes {
  brands: DeviceBrand[]; bindings: Binding[];
  garminBleBound: boolean; garminAutoConnected: boolean; garminActivityCount: number;
}

type BrandCard = DeviceBrand & { _categoryLabel: string };

// === 佳明 tab ===
interface ActivityRow {
  id: string; type: string; sportType: string; startTime: string;
  distanceKm: string; durationMin: string; avgHr: number | null;
  status?: string; importCheckinId?: string | null; importedAt?: string | null;
}

// === 导入 tab ===
const IMPORT_BRAND_ICON: Record<string, string> = {
  garmin: '⌚', xiaomi: '⌚', coros: '⌚', huawei: '⌚', suunto: '⌚',
  honor: '⌚', ble: '💓', werun: '💬', zepp: '📱',
};

Page({
  data: {
    tab: 'bind' as DeviceTab,
    // 绑定 tab
    brands: [] as BrandCard[],
    bindings: [] as Binding[],
    garminBleBound: false,
    garminAutoConnected: false,
    garminActivityCount: 0,
    bindLoading: false,
    scanVisible: false,
    scanning: false,
    foundDevices: [] as FoundDevice[],
    connecting: false,
    liveHr: null as number | null,
    liveBattery: null as number | null,
    liveModel: null as string | null,
    liveManufacturer: null as string | null,
    liveSpO2: null as { spo2: number; pr: number } | null,
    liveBodyLocation: null as string | null,
    hrBuffer: [] as { hr: number; ts: number }[],
    hrUploadTimer: null as ReturnType<typeof setInterval> | null,
    boundBleDeviceId: '' as string,
    debugVisible: false,
    debugLog: [] as string[],
    hrCount: 0,
    liveScale: null as { weight: number; bodyFat?: number; bmi?: number; muscle?: number; bone?: number; water?: number; visceralFat?: number; impedance?: number; stabilized: boolean } | null,
    scaleConnected: false,
    werunRecords: [] as { date: string; step: number; km: number }[],
    werunSummary: { totalSteps: 0, totalKm: 0, days: 0 } as { totalSteps: number; totalKm: number; days: number },
    // 佳明 tab
    gTab: 'pending' as 'pending' | 'processed',
    gList: [] as ActivityRow[],
    gLoading: false,
    climbCompensation: false,
    // 导入 tab
    iBrands: DEVICE_BRANDS.map((b) => ({
      key: b.key, name: b.name, icon: IMPORT_BRAND_ICON[b.key] ?? '📱',
      available: b.available, categoryLabel: DEVICE_CATEGORY_LABEL[b.category],
    })),
    selectedKey: '',
    guide: null as null | {
      sourceLabel: string; sourceUrl?: string;
      steps: { text: string; shot?: string }[];
      action: { label: string; url?: string; available: boolean };
    },
    xiaomiFiles: [] as { name: string; size: number; isDirectory: boolean; preview?: string }[],
    xiaomiCount: 0,
  },

  onShow() {
    this.loadByTab(this.data.tab);
  },

  onHide() {
    this.uploadHrBuffer();
    this.stopHrUpload();
    closeBleAdapter();
  },

  onUnload() {
    this.uploadHrBuffer();
    this.stopHrUpload();
  },

  onSwitchTab(e: WechatMiniprogram.TouchEvent) {
    const tab = (e.currentTarget.dataset.tab as DeviceTab) || 'bind';
    if (tab === this.data.tab) return;
    this.setData({ tab });
    this.loadByTab(tab);
  },

  loadByTab(tab: DeviceTab) {
    if (tab === 'bind') { this.loadBindings(); this.loadWeRun(); }
    else if (tab === 'garmin') this.loadGarminList();
    // import tab 静态（品牌列表 data 初始化）
  },

  // ===== 绑定 tab =====
  async loadBindings() {
    this.setData({ bindLoading: true });
    try {
      const res = await api.call<MyBindingsRes>('device', 'myBindings', {});
      const boundBle = res.bindings.find((b) => b.vendor === 'ble' || b.vendor === 'garmin' || b.vendor === 'xiaomi' || b.vendor === 'coros');
      this.setData({
        brands: res.brands.map((b) => ({ ...b, _categoryLabel: DEVICE_CATEGORY_LABEL[b.category] })),
        bindings: res.bindings,
        garminBleBound: res.garminBleBound,
        garminAutoConnected: res.garminAutoConnected,
        garminActivityCount: res.garminActivityCount,
        bindLoading: false,
      });
      if (boundBle) this.setData({ boundBleDeviceId: boundBle.deviceName });
    } catch {
      this.setData({ bindLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onTapBrand(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    const brand = this.data.brands.find((b) => b.key === key);
    if (!brand) return;
    if (!brand.available) { wx.showToast({ title: '敬请期待', icon: 'none' }); return; }
    if (brand.connectionType === 'ble' || brand.key === 'garmin' || brand.key === 'xiaomi') {
      this.startScan();
    } else if (brand.key === 'werun') {
      wx.showToast({ title: '微信运动同步开发中', icon: 'none' });
    }
  },

  async startScan() {
    this.setData({ scanVisible: true, scanning: true, foundDevices: [], liveHr: null, hrCount: 0 });
    this.pushLog('开启蓝牙适配器...');
    try {
      await openBleAdapter();
      this.pushLog('✓ 适配器已开，扫描中（5s，无过滤）...');
      const devices = await scanBleDevices(5000);
      const enriched: FoundDevice[] = devices
        .filter((d) => d.name && d.name !== '未知设备')
        .map((d) => {
          const detectedBrand = matchBleVendor(d.name);
          const isScale = matchScaleVendor(d.name);
          return { ...d, detectedBrand: isScale ? 'mi_scale' : detectedBrand, brandLabel: isScale ? '体脂秤' : (BRAND_LABEL[detectedBrand] ?? '通用') };
        })
        .sort((a, b) => { const score = (v: string) => (v === 'ble' ? 1 : 0); return score(a.detectedBrand) - score(b.detectedBrand); });
      this.setData({ foundDevices: enriched, scanning: false });
      const identified = enriched.filter((d) => d.detectedBrand !== 'ble').length;
      this.pushLog(`扫描完成，发现 ${enriched.length} 个设备（品牌识别 ${identified} 个）`);
      if (enriched.length === 0) wx.showToast({ title: '未发现蓝牙心率设备', icon: 'none' });
    } catch (e) {
      this.setData({ scanning: false });
      const msg = (e as Error).message || '扫描失败';
      this.pushLog(`✗ ${msg}`);
      wx.showToast({ title: msg, icon: 'none' });
    }
  },

  async onSelectDevice(e: WechatMiniprogram.TouchEvent) {
    const device = e.currentTarget.dataset.device as FoundDevice;
    if (this.data.connecting) return;
    this.setData({ connecting: true });
    wx.showLoading({ title: '连接中...' });
    this.pushLog(`连接 ${device.name}...`);

    if (device.detectedBrand === 'mi_scale' || matchScaleVendor(device.name)) {
      return this.connectScaleDevice(device);
    }

    try {
      await connectDevice(device.deviceId);
      this.pushLog('✓ 已连接，读取电量/设备信息...');

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
        this.pushLog(`服务 ${services.length} 个 | 心率0x180D ${hasHr ? '✓' : '✗'} | 血氧0x1822 ${hasSpO2 ? '✓' : '✗'} | 小米0xFEE0 ${hasMi ? '✓' : '✗'} | 电量0x180F ${hasBat ? '✓' : '✗'} | 设备信息0x180A ${hasInfo ? '✓' : '✗'}`);
        this.pushLog(`服务全集: ${services.map((s) => s.replace(/-/g, '').slice(4, 8)).join(', ')}`);
      } catch (e) {
        this.pushLog(`⚠ 获取服务列表失败：${(e as Error).message}`);
      }

      const [battery, deviceInfo, bodyLocation] = await Promise.all([
        readBattery(device.deviceId),
        readDeviceInfo(device.deviceId),
        readBodySensorLocation(device.deviceId),
      ]);
      this.pushLog(`电量 ${battery ?? '?'}% · 厂商 ${deviceInfo.manufacturer ?? '未知'} · 型号 ${deviceInfo.model ?? '未知'} · 佩戴 ${bodyLocation ?? '?'}`);
      if (bodyLocation) this.setData({ liveBodyLocation: bodyLocation });

      let vendor = device.detectedBrand as 'ble' | 'garmin' | 'xiaomi' | 'coros';
      if (vendor === 'ble' && deviceInfo.manufacturer) {
        const byMfg = matchBleVendor(deviceInfo.manufacturer);
        if (byMfg !== 'ble') vendor = byMfg;
      }
      if (vendor === 'ble') {
        wx.hideLoading();
        const choice = await this.askBrandSelect();
        if (!choice) { await disconnectDevice(device.deviceId); this.setData({ connecting: false }); return; }
        vendor = choice;
        wx.showLoading({ title: '订阅心率...' });
      }

      this.pushLog(`品牌识别：${vendor}，订阅心率服务...`);
      let hrSubscribed = false;
      if (!hasHr) {
        this.pushLog(`⚠ ${BRAND_LABEL[vendor] || vendor} 不支持标准心率服务 0x180D，心率订阅跳过`);
      } else {
        try {
          await subscribeHeartRate(device.deviceId, (hr) => {
            this.setData({ liveHr: hr, hrCount: this.data.hrCount + 1 });
            const buf = [...this.data.hrBuffer, { hr, ts: Date.now() }].slice(-100);
            this.setData({ hrBuffer: buf });
            if (buf.length === 1) this.uploadHrBuffer();
          });
          hrSubscribed = true;
          this.pushLog('✓ 心率订阅成功');
          this.startHrUpload();
        } catch (hrErr) {
          this.pushLog(`⚠ 心率订阅失败：${(hrErr as Error).message}`);
        }
      }

      if (hasSpO2) {
        this.pushLog('检测到血氧服务 0x1822，订阅中（请在手环上测血氧）...');
        this.readSpO2(device.deviceId);
      } else {
        this.pushLog('⚠ 未检测到血氧服务 0x1822');
      }

      await api.call('device', 'bindBleDevice', {
        deviceId: device.deviceId, name: device.name,
        services: ['0000180D-0000-1000-8000-00805F9B34FB'], vendor,
        brandMeta: { manufacturer: deviceInfo.manufacturer ?? undefined, model: deviceInfo.model ?? undefined },
      });

      wx.hideLoading();
      this.setData({
        connecting: false, scanVisible: false, boundBleDeviceId: device.deviceId,
        liveBattery: battery, liveModel: deviceInfo.model, liveManufacturer: deviceInfo.manufacturer,
      });
      wx.showToast({ title: hrSubscribed ? '绑定成功' : '已绑定（心率暂不可用）', icon: hrSubscribed ? 'success' : 'none' });
      this.pushLog(`✓ 已绑定（${BRAND_LABEL[vendor]}）`);
      this.loadBindings();
    } catch (e) {
      wx.hideLoading();
      this.setData({ connecting: false });
      wx.showToast({ title: (e as Error).message || '连接失败', icon: 'none' });
    }
  },

  async connectScaleDevice(device: FoundDevice) {
    try {
      const { serviceId, characteristicId, type } = await connectScale(device.deviceId);
      this.pushLog(`✓ 体脂秤已连接，Service ${type === 'body_composition' ? '0x181B（体成分）' : '0x181D（体重）'}`);
      this.setData({ scanVisible: false, connecting: false, scaleConnected: true, boundBleDeviceId: device.deviceId });
      wx.hideLoading();
      wx.showToast({ title: '请站上秤测量', icon: 'none' });

      subscribeScaleData(device.deviceId, serviceId, characteristicId, (data) => {
        if (data.impedance) {
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
              visceralFat: bodyData.visceralFat, impedance: bodyData.impedance, stabilized: data.stabilized,
            },
          });
        } else {
          this.setData({ liveScale: { weight: data.weight, stabilized: data.stabilized } });
        }
      }, (err) => { this.pushLog(`⚠ 秤数据订阅失败: ${err.errMsg}`); });
    } catch (e) {
      wx.hideLoading();
      this.setData({ connecting: false });
      wx.showToast({ title: (e as Error).message || '体脂秤连接失败', icon: 'none' });
    }
  },

  async onSaveScaleData() {
    const scale = this.data.liveScale;
    if (!scale || !scale.stabilized) { wx.showToast({ title: '请等待体重稳定', icon: 'none' }); return; }
    try {
      await api.call('device', 'submitBodyComposition', {
        weight: scale.weight, bodyFat: scale.bodyFat, bmi: scale.bmi, muscle: scale.muscle,
        bone: scale.bone, water: scale.water, visceralFat: scale.visceralFat, impedance: scale.impedance,
      });
      wx.showToast({ title: '已保存', icon: 'success' });
      if (this.data.boundBleDeviceId) {
        await disconnectScale(this.data.boundBleDeviceId);
        this.setData({ scaleConnected: false, liveScale: null, boundBleDeviceId: '' });
      }
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '保存失败', icon: 'none' });
    }
  },

  askBrandSelect(): Promise<'ble' | 'garmin' | 'xiaomi' | null> {
    return new Promise((resolve) => {
      wx.showActionSheet({
        itemList: ['佳明手表', '小米手环', '通用蓝牙设备'],
        success: (res) => { const map = ['garmin', 'xiaomi', 'ble'] as const; resolve(map[res.tapIndex] ?? null); },
        fail: () => resolve(null),
      });
    });
  },

  pushLog(msg: string) {
    const time = new Date().toTimeString().slice(0, 8);
    const log = [...this.data.debugLog, `[${time}] ${msg}`].slice(-20);
    this.setData({ debugLog: log });
  },

  startHrUpload() {
    this.stopHrUpload();
    const timer = setInterval(() => this.uploadHrBuffer(), 5000);
    this.setData({ hrUploadTimer: timer });
  },

  stopHrUpload() {
    if (this.data.hrUploadTimer) { clearInterval(this.data.hrUploadTimer); this.setData({ hrUploadTimer: null }); }
  },

  async uploadHrBuffer() {
    const samples = this.data.hrBuffer;
    if (samples.length === 0) return;
    this.setData({ hrBuffer: [] });
    try {
      await api.call('device', 'submitHeartRate', { samples });
      const latest = samples[samples.length - 1];
      this.cacheHealth('hr', { value: latest.hr, timestamp: new Date(latest.ts).toISOString() });
    } catch { /* 失败丢弃 */ }
  },

  cacheHealth(key: string, value: unknown) {
    try {
      const cached = (wx.getStorageSync('todayHealth') as Record<string, unknown>) || {};
      cached[key] = value;
      cached.lastUpdate = Date.now();
      wx.setStorageSync('todayHealth', cached);
    } catch { /* 静默 */ }
  },

  async readSpO2(deviceId: string) {
    try {
      const result = await readSpO2SpotCheck(deviceId, 30000);
      if (result) {
        this.setData({ liveSpO2: result });
        this.pushLog(`✓ 血氧 ${result.spo2}% · 脉率 ${result.pr}`);
        try {
          await api.call('device', 'submitSpO2', { value: result.spo2 });
          this.cacheHealth('spo2', { value: result.spo2, timestamp: new Date().toISOString() });
        } catch { /* 静默 */ }
      } else {
        this.pushLog('⚠ 血氧测量超时（30s 未推送）');
      }
    } catch (e) {
      this.pushLog(`⚠ 血氧读取失败：${(e as Error).message}`);
    }
  },

  async onSyncWeRun() {
    wx.showLoading({ title: '同步中...' });
    try {
      const res = await new Promise<WechatMiniprogram.GetWeRunDataSuccessCallbackResult>((resolve, reject) => {
        wx.getWeRunData({ success: resolve, fail: reject });
      });
      const result = await api.call<{ synced: number; days: number }>('device', 'syncWeRun', {
        encryptedData: res.encryptedData, iv: res.iv,
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
      } else { wx.showToast({ title: msg, icon: 'none' }); }
    }
  },

  async loadWeRun() {
    try {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86400 * 1000);
      const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const res = await api.call<{ records: { date: string; step: number; km: number }[]; totalSteps: number; totalKm: number; days: number }>(
        'device', 'myWeRun', { startDate: fmt(start), endDate: fmt(end) },
      );
      this.setData({
        werunRecords: res.records.slice().reverse(),
        werunSummary: { totalSteps: res.totalSteps, totalKm: res.totalKm, days: res.days },
      });
    } catch { /* 静默 */ }
  },

  toggleDebug() { this.setData({ debugVisible: !this.data.debugVisible }); },

  closeScan() {
    this.setData({ scanVisible: false });
    if (this.data.scanning) { closeBleAdapter(); this.setData({ scanning: false }); }
  },

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
          if ((vendor === 'ble' || vendor === 'garmin' || vendor === 'xiaomi') && this.data.boundBleDeviceId) {
            await disconnectDevice(this.data.boundBleDeviceId);
            this.setData({ boundBleDeviceId: '', liveHr: null, liveBattery: null, liveModel: null, liveManufacturer: null });
          }
          wx.showToast({ title: '已解绑', icon: 'success' });
          this.loadBindings();
        } catch { wx.showToast({ title: '解绑失败', icon: 'none' }); }
      },
    });
  },

  // ===== V0.1.150 上传运动数据包（COS 中转 → 后台异步解析）=====
  async onUploadData(e: WechatMiniprogram.TouchEvent) {
    const type = e.currentTarget.dataset.type as 'xiaomi_zip' | 'coros_fit';
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: type === 'xiaomi_zip' ? ['zip'] : ['fit'],
      success: async (r) => {
        if (!r.tempFiles.length) return;
        const path = r.tempFiles[0].path;
        // 小米 ZIP 加密包需密码
        let password: string | undefined;
        if (type === 'xiaomi_zip') {
          const pwdRes = await wx.showModal({ title: '小米数据包密码', editable: true, placeholderText: '加密 ZIP 密码' });
          if (!pwdRes.confirm || !pwdRes.content) {
            wx.showToast({ title: '需要密码', icon: 'none' });
            return;
          }
          password = pwdRes.content;
        }
        wx.showLoading({ title: '上传中...' });
        try {
          await api.uploadDataFile(path, type, password);
          wx.hideLoading();
          wx.showToast({ title: '已上传，后台解析中', icon: 'none', duration: 2500 });
        } catch {
          wx.hideLoading();
          wx.showToast({ title: '上传失败', icon: 'none' });
        }
      },
    });
  },

  // ===== 佳明 tab =====
  async loadGarminList() {
    this.setData({ gLoading: true });
    try {
      const action = this.data.gTab === 'pending' ? 'myPending' : 'myProcessed';
      const res = await api.call<{ list: Array<ActivityRow & { distanceMeters: number | null; durationSec: number | null }>; total: number }>(
        'device', action, { page: 1, pageSize: 50 },
      );
      this.setData({
        gList: res.list.map((a) => ({
          id: a.id, type: a.type, sportType: a.sportType,
          startTime: a.startTime.slice(0, 16).replace('T', ' '),
          distanceKm: a.distanceMeters != null ? (a.distanceMeters / 1000).toFixed(2) : '-',
          durationMin: a.durationSec != null ? Math.round(a.durationSec / 60).toString() : '-',
          avgHr: a.avgHr ?? null, status: a.status, importCheckinId: a.importCheckinId, importedAt: a.importedAt,
        })),
        gLoading: false,
      });
    } catch {
      this.setData({ gLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  onSwitchGarminTab(e: WechatMiniprogram.TouchEvent) {
    const tab = e.currentTarget.dataset.tab as 'pending' | 'processed';
    if (tab === this.data.gTab) return;
    this.setData({ gTab: tab, gList: [] });
    this.loadGarminList();
  },

  toggleClimb() { this.setData({ climbCompensation: !this.data.climbCompensation }); },

  async onImport(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showLoading({ title: '提交中...' });
    try {
      const res = await api.call<{ jobId: string; queued: number }>('device', 'importToCheckin', { activityIds: [id] });
      wx.hideLoading();
      wx.showToast({ title: `已入队 ${res.queued} 条`, icon: 'success' });
      setTimeout(() => this.loadGarminList(), 1500);
    } catch {
      wx.hideLoading();
      wx.showToast({ title: '导入失败', icon: 'none' });
    }
  },

  async onIgnore(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showModal({
      title: '忽略活动',
      content: '忽略后这条活动不会进入榜单，可后续在已处理查看。',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('device', 'ignoreActivity', { activityId: id });
          wx.showToast({ title: '已忽略', icon: 'success' });
          this.loadGarminList();
        } catch { wx.showToast({ title: '操作失败', icon: 'none' }); }
      },
    });
  },

  // ===== 导入 tab =====
  onTapImportBrand(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.key as string;
    const g = IMPORT_GUIDE[key];
    this.setData({
      selectedKey: key,
      guide: g ? { sourceLabel: g.sourceLabel, sourceUrl: g.sourceUrl, steps: g.steps, action: g.action } : null,
    });
  },

  onCopyUrl() {
    const url = this.data.guide?.sourceUrl;
    if (!url) return;
    wx.setClipboardData({ data: url, success: () => wx.showToast({ title: '链接已复制', icon: 'none' }) });
  },

  onImportAction() {
    if (this.data.selectedKey === 'xiaomi') { this.onXiaomiUpload(); return; }
    if (this.data.selectedKey === 'coros') { this.onCorosFitUpload(); return; }
    const url = this.data.guide?.action.url;
    if (url) wx.navigateTo({ url });
    else wx.showToast({ title: '功能开发中', icon: 'none' });
  },

  onXiaomiUpload() {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['zip'],
      success: (res) => {
        const file = res.tempFiles[0];
        wx.showModal({
          title: '请输入 ZIP 解压密码',
          content: '小米隐私中心导出 ZIP 时设置的解压密码',
          editable: true, placeholderText: '解压密码',
          success: (m) => {
            if (!m.confirm) return;
            if (!m.content) { wx.showToast({ title: '请输入密码', icon: 'none' }); return; }
            this.doUpload(file, m.content);
          },
        });
      },
    });
  },

  onCorosFitUpload() {
    wx.chooseMessageFile({
      count: 1, type: 'file', extension: ['fit'],
      success: (res) => {
        const file = res.tempFiles[0];
        const token = wx.getStorageSync('accessToken');
        const base = (wx as unknown as { $apiBase?: string }).$apiBase || ENV.apiBase;
        wx.showLoading({ title: '解析 FIT 中...' });
        wx.uploadFile({
          url: `${base}/api/device/uploadCorosFit`, filePath: file.path, name: 'file',
          header: token ? { authorization: `Bearer ${token}` } : {},
          success: (r) => {
            wx.hideLoading();
            try {
              const data = JSON.parse(r.data);
              if (data.code === 0) {
                wx.showModal({ title: '✅ 导入成功', content: `${data.data.type} · ${(data.data.distanceMeters / 1000).toFixed(2)}km`, showCancel: false });
              } else { wx.showToast({ title: data.msg || '上传失败', icon: 'none' }); }
            } catch { wx.showToast({ title: '解析失败', icon: 'none' }); }
          },
          fail: () => { wx.hideLoading(); wx.showToast({ title: '上传失败', icon: 'none' }); },
        });
      },
    });
  },

  doUpload(file: { path: string }, password: string) {
    const token = wx.getStorageSync('accessToken');
    const base = (wx as unknown as { $apiBase?: string }).$apiBase || ENV.apiBase;
    wx.showLoading({ title: '上传解析中...' });
    wx.uploadFile({
      url: `${base}/api/device/uploadXiaomiZip`, filePath: file.path, name: 'file',
      header: token ? { authorization: `Bearer ${token}` } : {}, formData: { password },
      success: (r) => {
        wx.hideLoading();
        try {
          const data = JSON.parse(r.data);
          if (data.code === 0) {
            const d = data.data;
            this.setData({ xiaomiFiles: [], xiaomiCount: 0 });
            wx.showModal({
              title: '✅ 导入成功',
              content: `心率 ${d.hr} 条\n血氧 ${d.spo2} 条\n睡眠 ${d.sleep} 天\n步数 ${d.steps} 天`,
              confirmText: '看历史', cancelText: '关闭',
              success: (m) => m.confirm && wx.navigateTo({ url: '/pages/health/index?tab=history' }),
            });
          } else { wx.showToast({ title: data.msg || '上传失败', icon: 'none' }); }
        } catch { wx.showToast({ title: '解析失败', icon: 'none' }); }
      },
      fail: () => { wx.hideLoading(); wx.showToast({ title: '上传失败', icon: 'none' }); },
    });
  },
});
