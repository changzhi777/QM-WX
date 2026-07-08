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
  closeBleAdapter,
  type BleDevice,
} from '../../utils/ble';
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
    boundBleDeviceId: '' as string,
    // 蓝牙联调辅助（GAP-9，真机调试可观测性）
    debugVisible: false,
    debugLog: [] as string[],
    hrCount: 0,
  },

  onShow() {
    this.loadBindings();
  },

  onHide() {
    // 离开页面释放蓝牙资源（不断开绑定，只停扫描/订阅）
    closeBleAdapter();
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
          return { ...d, detectedBrand, brandLabel: BRAND_LABEL[detectedBrand] ?? '通用' };
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
    try {
      await connectDevice(device.deviceId);
      this.pushLog('✓ 已连接，读取电量/设备信息...');

      // V0.1.33：读电量 + 设备信息（0x180F + 0x180A）
      const [battery, deviceInfo] = await Promise.all([
        readBattery(device.deviceId),
        readDeviceInfo(device.deviceId),
      ]);
      this.pushLog(
        `电量 ${battery ?? '?'}% · 厂商 ${deviceInfo.manufacturer ?? '未知'} · 型号 ${deviceInfo.model ?? '未知'}`,
      );

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
      // V0.1.42：心率订阅容错（小米手环用私有 0xFEE0，可能不支持标准 0x180D）
      let hrSubscribed = false;
      try {
        await subscribeHeartRate(device.deviceId, (hr) => {
          this.setData({ liveHr: hr, hrCount: this.data.hrCount + 1 });
        });
        hrSubscribed = true;
        this.pushLog('✓ 心率订阅成功');
      } catch (hrErr) {
        this.pushLog(`⚠ 心率订阅失败（${vendor} 可能不支持标准 0x180D）：${(hrErr as Error).message}`);
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
