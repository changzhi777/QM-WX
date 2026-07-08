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
  pulseOximeter: '00001822-0000-1000-8000-00805F9B34FB', // V0.1.43 血氧服务（PLX）
} as const;

/** 心率测量值特征 UUID（心率服务 0x180D 下） */
const HR_MEASUREMENT_CHAR = '00002A37-0000-1000-8000-00805F9B34FB';
/** 电量特征 UUID（电量服务 0x180F 下，V0.1.33） */
const BATTERY_LEVEL_CHAR = '00002A19-0000-1000-8000-00805F9B34FB';
/** 设备信息特征 UUID（设备信息服务 0x180A 下，V0.1.33 品牌识别验证） */
const MANUFACTURER_NAME_CHAR = '00002A29-0000-1000-8000-00805F9B34FB';
const MODEL_NUMBER_CHAR = '00002A24-0000-1000-8000-00805F9B34FB';
/** 体感位置特征（心率服务 0x180D 下，V0.1.43，read）*/
const BODY_SENSOR_LOCATION_CHAR = '00002A38-0000-1000-8000-00805F9B34FB';
/** 血氧 Spot-Check 测量特征（血氧服务 0x1822 下，V0.1.43，notify）*/
const SPO2_SPOT_CHAR = '00002A5F-0000-1000-8000-00805F9B34FB';

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
 * V0.1.43 改进：
 * 1. **订阅前 off 清理旧监听** — 用户重复绑定（解绑再绑）时避免累积 onBLECharacteristicValueChange 监听器
 *    （readCharValue 的临时监听在 finish 时已自行 off，此处无参 off 安全）
 * 2. **3 次重试 + 500ms 间隔** — createBLEConnection 后服务发现有延迟，首次 notifyBLECharacteristicValueChange
 *    常因服务未就绪失败（标准手环常见，非设备不支持）；retry 给服务发现留时间
 *
 * @param deviceId 已连接的设备 ID
 * @param onHr 心率回调（每次收到测量值触发）
 */
export async function subscribeHeartRate(deviceId: string, onHr: (hr: number) => void): Promise<void> {
  // 防御性：清理旧监听器（readCharValue 已自管生命周期，此处清的是上次 subscribeHeartRate 残留）
  // @ts-ignore：无参 off 清所有监听，微信运行时支持，typings 签名 `()`
  wx.offBLECharacteristicValueChange();
  wx.onBLECharacteristicValueChange((res) => {
    if (res.value && res.serviceId === BLE_SERVICES.heartRate) {
      const hr = parseHeartRateValue(res.value);
      if (hr !== null) onHr(hr);
    }
  });

  // 重试：连接后服务发现延迟，首次订阅常失败
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        wx.notifyBLECharacteristicValueChange({
          deviceId,
          serviceId: BLE_SERVICES.heartRate,
          characteristicId: HR_MEASUREMENT_CHAR,
          state: true,
          success: () => resolve(),
          fail: (err) => reject(new Error(err.errMsg || '订阅心率失败')),
        });
      });
      return; // 订阅成功
    } catch (e) {
      lastErr = e as Error;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw lastErr ?? new Error('订阅心率失败');
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

// ===== V0.1.43 血氧（PLX 0x1822）+ 体感位置（0x2A38）=====

/**
 * IEEE 11073-20601 SFLOAT 解析（2 字节，血氧值编码）
 *
 * 低 12 位尾数（补码）+ 高 4 位指数（补码）。血氧 SpO2 / 脉率 PR 均用此编码。
 * 特殊值 0x07FF(2047) / 0x0800(-2048) = NaN/INFINITY，返 null。
 */
function parseSFLOAT(data: DataView, offset: number): number | null {
  if (offset + 2 > data.byteLength) return null;
  const raw = data.getUint16(offset, true); // little-endian
  let mantissa = raw & 0x0fff; // 低 12 位尾数
  let exponent = (raw >> 12) & 0x0f; // 高 4 位指数
  if (mantissa & 0x0800) mantissa -= 0x1000; // 12 位补码符号扩展
  if (exponent & 0x0008) exponent -= 0x10; // 4 位补码符号扩展
  if (mantissa === 2047 || mantissa === -2048) return null; // NaN/保留值
  return mantissa * Math.pow(10, exponent);
}

/** 解析血氧 Spot-Check 测量值（0x2A5F：flags + SpO2 SFLOAT + PR SFLOAT）*/
function parseSpO2Measurement(buffer: ArrayBuffer): { spo2: number; pr: number } | null {
  const data = new DataView(buffer);
  if (data.byteLength < 5) return null;
  // byte 0: flags（bit0=timestamp present, bit1=status, bit2=device sensor）— offset 从 1 开始
  const spo2 = parseSFLOAT(data, 1);
  const pr = parseSFLOAT(data, 3);
  if (spo2 == null || pr == null) return null;
  return { spo2: Math.round(spo2), pr: Math.round(pr) };
}

const BODY_SENSOR_LOCATIONS = ['Other', 'Chest', 'Wrist', 'Finger', 'Hand', 'EarLobe', 'Foot'] as const;

/** 解析体感位置（0x2A38 单字节枚举）*/
function parseBodySensorLocation(buffer: ArrayBuffer): string | null {
  const data = new DataView(buffer);
  if (data.byteLength < 1) return null;
  const v = data.getUint8(0);
  return BODY_SENSOR_LOCATIONS[v] ?? 'Unknown';
}

/**
 * 读体感位置（心率服务 0x180D 的 0x2A38，read）
 *
 * 小米手环应返 "Wrist"。静态值，低频读取。
 */
export async function readBodySensorLocation(deviceId: string): Promise<string | null> {
  const buf = await readCharValue(deviceId, BLE_SERVICES.heartRate, BODY_SENSOR_LOCATION_CHAR);
  return buf ? parseBodySensorLocation(buf) : null;
}

/**
 * 读血氧单次测量（血氧服务 0x1822 的 0x2A5F，notify）
 *
 * 0x2A5F 是 notify-only 特征，订阅后等设备推送（用户在手环上测血氧时触发）。
 * 超时返 null（设备未推送/不支持）。10s 超时（血氧测量较慢）。
 */
export function readSpO2SpotCheck(
  deviceId: string,
  timeout = 10000,
): Promise<{ spo2: number; pr: number } | null> {
  return new Promise((resolve) => {
    let settled = false;
    type CharValueResult = { serviceId: string; characteristicId: string; value: ArrayBuffer };
    const finish = (val: { spo2: number; pr: number } | null) => {
      if (settled) return;
      settled = true;
      // @ts-ignore：offBLECharacteristicValueChange 运行时支持 cb 参数
      wx.offBLECharacteristicValueChange(handler);
      resolve(val);
    };
    const handler = (res: CharValueResult) => {
      const s = (res.serviceId || '').toLowerCase();
      const c = (res.characteristicId || '').toLowerCase();
      if (
        s === BLE_SERVICES.pulseOximeter.toLowerCase() &&
        c === SPO2_SPOT_CHAR.toLowerCase() &&
        res.value
      ) {
        finish(parseSpO2Measurement(res.value));
      }
    };
    // @ts-ignore：handler 结构与微信回调兼容
    wx.onBLECharacteristicValueChange(handler);
    wx.notifyBLECharacteristicValueChange({
      deviceId,
      serviceId: BLE_SERVICES.pulseOximeter,
      characteristicId: SPO2_SPOT_CHAR,
      state: true,
      success: () => setTimeout(() => finish(null), timeout),
      fail: () => finish(null),
    });
  });
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
