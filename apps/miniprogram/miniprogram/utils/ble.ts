// utils/ble.ts — 蓝牙 BLE 设备扫描/连接/订阅工具（V0.1.25，参考图 2770）
//
// 微信小程序蓝牙 API 封装。标准 GATT 服务（所有手环/手表/心率带通用）：
// - 心率 0000180D-0000-1000-8000-00805F9B34FB（Heart Rate）
// - 电量 0000180F-...（Battery）
// - 设备信息 0000180A-...（Device Information）
//
// 典型流程：
//   await openBleAdapter();
//   const devices = await scanBleDevices(5000);
//   await connectDevice(deviceId);
//   await subscribeHeartRate(deviceId, (hr) => console.log('心率', hr));

/** 标准 GATT 服务 UUID（全小写连字符格式） */
export const BLE_SERVICES = {
  heartRate: '0000180D-0000-1000-8000-00805F9B34FB',
  battery: '0000180F-0000-1000-8000-00805F9B34FB',
  deviceInfo: '0000180A-0000-1000-8000-00805F9B34FB',
} as const;

/** 心率测量值特征 UUID（心率服务 0x180D 下） */
const HR_MEASUREMENT_CHAR = '00002A37-0000-1000-8000-00805F9B34FB';
/** 电量特征 UUID（电量服务 0x180F 下，V0.1.33） */
const BATTERY_LEVEL_CHAR = '00002A19-0000-1000-8000-00805F9B34FB';
/** 设备信息特征 UUID（设备信息服务 0x180A 下，V0.1.33 品牌识别验证） */
const MANUFACTURER_NAME_CHAR = '00002A29-0000-1000-8000-00805F9B34FB';
const MODEL_NUMBER_CHAR = '00002A24-0000-1000-8000-00805F9B34FB';

export interface BleDevice {
  deviceId: string; // 微信 deviceId（iOS=UUID，Android=MAC）
  name: string;
  RSSI: number;
}

/** 打开蓝牙适配器（任何蓝牙操作前必须先 open） */
export function openBleAdapter(): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.openBluetoothAdapter({
      success: () => resolve(),
      fail: (err) => reject(new Error(err.errMsg || '蓝牙初始化失败，请检查蓝牙是否开启')),
    });
  });
}

/**
 * 扫描 BLE 设备（V0.1.42：无 services 过滤，扫所有 — 小米手环不广播 0x180D）
 *
 * 小米手环用私有服务 0xFEE0/0xFEE1，不广播标准心率服务 0x180D，
 * 按 services 过滤会扫不到。改为扫所有 BLE 设备，调用方用 matchBleVendor 筛选品牌。
 * 返回去重后的设备列表（按 deviceId 去重）
 */
export function scanBleDevices(timeout = 5000): Promise<BleDevice[]> {
  return new Promise((resolve, reject) => {
    const found = new Map<string, BleDevice>();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      wx.stopBluetoothDevicesDiscovery();
      wx.offBluetoothDeviceFound();
      resolve(Array.from(found.values()));
    };

    wx.startBluetoothDevicesDiscovery({
      // V0.1.42：不传 services = 扫所有（小米手环用私有 0xFEE0，不广播 0x180D 心率服务）
      allowDuplicatesKey: false,
      success: () => {
        wx.onBluetoothDeviceFound((res) => {
          for (const d of res.devices) {
            const name = d.name || d.localName || '未知设备';
            if (!found.has(d.deviceId)) {
              found.set(d.deviceId, { deviceId: d.deviceId, name, RSSI: d.RSSI });
            }
          }
        });
        setTimeout(finish, timeout);
      },
      fail: (err) => {
        if (!settled) {
          settled = true;
          reject(new Error(err.errMsg || '扫描失败'));
        }
      },
    });
  });
}

/** 连接 BLE 设备 */
export function connectDevice(deviceId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.createBLEConnection({
      deviceId,
      timeout: 10_000,
      success: () => resolve(),
      fail: (err) => reject(new Error(err.errMsg || '连接失败')),
    });
  });
}

/** 断开 BLE 设备 */
export function disconnectDevice(deviceId: string): Promise<void> {
  return new Promise((resolve) => {
    wx.closeBLEConnection({ deviceId, success: () => resolve(), fail: () => resolve() });
  });
}

/**
 * 订阅心率测量值（心率服务 0x180D 的 2A37 特征）
 *
 * @param deviceId 已连接的设备 ID
 * @param onHr 心率回调（每次收到测量值触发）
 */
export function subscribeHeartRate(deviceId: string, onHr: (hr: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    wx.notifyBLECharacteristicValueChange({
      deviceId,
      serviceId: BLE_SERVICES.heartRate,
      characteristicId: HR_MEASUREMENT_CHAR,
      state: true,
      success: () => {
        wx.onBLECharacteristicValueChange((res) => {
          if (res.value && res.serviceId === BLE_SERVICES.heartRate) {
            const hr = parseHeartRateValue(res.value);
            if (hr !== null) onHr(hr);
          }
        });
        resolve();
      },
      fail: (err) => reject(new Error(err.errMsg || '订阅心率失败')),
    });
  });
}

/**
 * 解析心率测量值（BLE Heart Rate Service spec）
 *
 * 第 0 字节 flags：bit0=0 → HR uint8（第 1 字节）；bit0=1 → HR uint16（第 1-2 字节）
 */
function parseHeartRateValue(buffer: ArrayBuffer): number | null {
  const data = new DataView(buffer);
  if (data.byteLength < 2) return null;
  const flags = data.getUint8(0);
  const isUint16 = (flags & 0x01) === 1;
  if (isUint16) {
    if (data.byteLength < 3) return null;
    return data.getUint16(1, true);
  }
  return data.getUint8(1);
}

// ===== V0.1.33 多服务读取（电量 + 设备信息，用于品牌识别 + 状态展示）=====

/** ArrayBuffer 解码（去尾部 null + trim）*/
function decodeUtf8(buffer: ArrayBuffer): string | null {
  try {
    const bytes = new Uint8Array(buffer);
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) end--;
    if (end === 0) return null;
    // 小程序非 DOM 环境，无 TextDecoder；BLE Manufacturer Name / Model Number 规范为 ASCII，fromCharCode 够用
    return String.fromCharCode(...bytes.slice(0, end)).trim() || null;
  } catch {
    return null;
  }
}

/**
 * 读 BLE 特征值（V0.1.33 通用工具）
 *
 * 微信文档：readBLECharacteristicValue 的值通过 onBLECharacteristicValueChange 回调拿
 * （success 不直接返 value）。这里临时监听，匹配 serviceId+characteristicId 后 resolve + off。
 * 超时返 null（设备不支持该特征）。
 *
 * 与 subscribeHeartRate 的全局监听共存：按 serviceId/characteristicId 过滤互不干扰
 * （心率 handler 只匹配 0x180D，电量/设备信息 handler 各匹配自己的 serviceId）。
 */
function readCharValue(
  deviceId: string,
  serviceId: string,
  characteristicId: string,
  timeout = 3000,
): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    let settled = false;
    // 结构类型匹配 BLE 特征值回调参数（避免依赖具体 WechatMiniprogram.XxxResult 类型名，兼容性更好）
    type CharValueResult = { serviceId: string; characteristicId: string; value: ArrayBuffer };
    const finish = (val: ArrayBuffer | null) => {
      if (settled) return;
      settled = true;
      // 微信运行时支持 offBLECharacteristicValueChange(cb) 移除特定监听；
      // miniprogram-api-typings 该版本类型签名未声明参数，用 ts-ignore 绕过
      // @ts-ignore
      wx.offBLECharacteristicValueChange(handler);
      resolve(val);
    };
    const handler = (res: CharValueResult) => {
      const s = (res.serviceId || '').toLowerCase();
      const c = (res.characteristicId || '').toLowerCase();
      if (s === serviceId.toLowerCase() && c === characteristicId.toLowerCase() && res.value) {
        finish(res.value);
      }
    };
    // @ts-ignore：handler 结构与 OnBLECharacteristicValueChangeCallback 兼容
    wx.onBLECharacteristicValueChange(handler);
    wx.readBLECharacteristicValue({
      deviceId,
      serviceId,
      characteristicId,
      success: () => setTimeout(() => finish(null), timeout),
      fail: () => finish(null),
    });
  });
}

/**
 * 读电量（0x180F / 2A19，返百分比 0-100）
 *
 * 部分设备不支持电量服务 → 返 null
 */
export async function readBattery(deviceId: string): Promise<number | null> {
  const buf = await readCharValue(deviceId, BLE_SERVICES.battery, BATTERY_LEVEL_CHAR);
  if (!buf || buf.byteLength < 1) return null;
  return new DataView(buf).getUint8(0);
}

/**
 * 读设备信息（0x180A：厂商名 + 型号）
 *
 * 用于品牌识别验证（Manufacturer Name String 是 BLE 规范权威字段，如 "Garmin"/"Xiaomi"）。
 * 部分设备不支持某些字段 → null。
 */
export async function readDeviceInfo(deviceId: string): Promise<{
  manufacturer: string | null;
  model: string | null;
}> {
  const [mfgBuf, modelBuf] = await Promise.all([
    readCharValue(deviceId, BLE_SERVICES.deviceInfo, MANUFACTURER_NAME_CHAR),
    readCharValue(deviceId, BLE_SERVICES.deviceInfo, MODEL_NUMBER_CHAR),
  ]);
  return {
    manufacturer: mfgBuf ? decodeUtf8(mfgBuf) : null,
    model: modelBuf ? decodeUtf8(modelBuf) : null,
  };
}

/**
 * 获取设备服务列表（V0.1.42 诊断小米手环支持哪些服务）
 *
 * 小米手环可能不支持标准 0x180D 心率服务（用私有 0xFEE0/0xFEE1）。
 * 连接后查服务列表，判断是否支持 0x180D，决定心率订阅策略。
 */
export function getDeviceServices(deviceId: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    wx.getBLEDeviceServices({
      deviceId,
      success: (res) => resolve(res.services.map((s) => s.uuid)),
      fail: (err) => reject(new Error(err.errMsg || '获取服务失败')),
    });
  });
}

/**
 * 获取某服务下的特征列表（V0.1.42 诊断 + 私有协议探索）
 */
export function getDeviceCharacteristics(deviceId: string, serviceId: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,
      success: (res) => resolve(res.characteristics.map((c) => c.uuid)),
      fail: (err) => reject(new Error(err.errMsg || '获取特征失败')),
    });
  });
}

/** 关闭蓝牙适配器（退出页面/解绑时调，释放资源） */
export function closeBleAdapter(): void {
  wx.stopBluetoothDevicesDiscovery();
  wx.offBluetoothDeviceFound();
  wx.offBLECharacteristicValueChange();
  wx.closeBluetoothAdapter({ success: () => {}, fail: () => {} });
}
