/**
 * utils/scale.ts 纯函数测试（V0.1.125）
 *
 * 测试 parseScaleData + calcBodyComposition（前端 utils 在后端 node 环境模拟）
 * 注意：wx BLE API 不可用，仅测纯解析/计算函数（无 wx 依赖）
 */
import { describe, it, expect } from 'vitest';

// 直接内联纯函数（避免 import wx 依赖的 scale.ts 报错）
// ===== 以下是从 scale.ts 提取的纯函数 =====

const CHAR_BODY_MEASUREMENT = '00002A9C-0000-1000-8000-00805F9B34FB';
const CHAR_WEIGHT_MEASUREMENT = '00002A9D-0000-1000-8000-00805F9B34FB';

interface ScaleData {
  weight: number;
  impedance?: number;
  stabilized: boolean;
  source: 'weight' | 'body_composition';
}

interface BodyComposition {
  weight: number;
  bodyFat: number;
  bmi: number;
  muscle: number;
  bone: number;
  water: number;
  visceralFat: number;
  impedance: number;
}

function parseWeightBytes(bytes: Uint8Array): ScaleData {
  const ctrl = bytes[0];
  const weightRaw = bytes[1] | (bytes[2] << 8);
  const isStable = (ctrl & 0x10) !== 0;
  const isLb = (ctrl & 0x08) !== 0;
  const weight = isLb ? weightRaw * 0.01 * 0.453592 : weightRaw * 0.01;
  return { weight: Math.round(weight * 100) / 100, stabilized: isStable, source: 'weight' };
}

function parseBodyCompositionBytes(bytes: Uint8Array): ScaleData {
  const flags = bytes[0];
  const weightRaw = bytes[1] | (bytes[2] << 8);
  const isStable = (flags & 0x20) !== 0;
  const weight = weightRaw * 0.01;
  let impedance: number | undefined;
  if (bytes.length >= 13) {
    const imp = bytes[11] | (bytes[12] << 8);
    if (imp > 0 && imp < 2000) impedance = imp;
  }
  return {
    weight: Math.round(weight * 100) / 100,
    impedance,
    stabilized: isStable,
    source: 'body_composition',
  };
}

function parseScaleData(buffer: ArrayBuffer, characteristicId: string): ScaleData | null {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 3) return null;
  if (characteristicId === CHAR_BODY_MEASUREMENT) return parseBodyCompositionBytes(bytes);
  return parseWeightBytes(bytes);
}

function calcBodyComposition(
  scaleData: ScaleData,
  height: number,
  gender: 'male' | 'female',
  age: number,
): BodyComposition {
  const { weight, impedance } = scaleData;
  const h = height / 100;
  const bmi = Math.round((weight / (h * h)) * 10) / 10;
  if (!impedance || impedance === 0) {
    return { weight, bodyFat: 0, bmi, muscle: 0, bone: 0, water: 0, visceralFat: 0, impedance: 0 };
  }
  const isMale = gender === 'male';
  const h2z = (height * height) / impedance;
  const tbwKg = isMale
    ? 1.20 + 0.45 * h2z + 0.18 * weight
    : 0.91 + 0.47 * h2z + 0.11 * weight;
  const ffm = tbwKg / 0.732;
  let bodyFat = Math.max(3, Math.min(60, Math.round(((weight - ffm) / weight) * 1000) / 10));
  const muscle = Math.round(ffm * 0.55 * 10) / 10;
  const bone = weight < 65
    ? Math.round((weight * 0.035) * 100) / 100
    : Math.round((weight * 0.040) * 100) / 100;
  const water = Math.max(35, Math.min(75, Math.round((tbwKg / weight) * 1000) / 10));
  const visceralFat = bmi > 30 ? Math.round(bmi - 18) : Math.max(1, Math.round((bmi - 15) * 0.8));
  return { weight, bodyFat, bmi, muscle, bone, water, visceralFat, impedance };
}

// ===== 测试用例 =====

describe('parseScaleData', () => {
  it('体重秤 0x2A9D → 解析体重 kg', () => {
    // ctrl=0x10（稳定）, weight=7000 → 70.00 kg
    const buf = new ArrayBuffer(3);
    const view = new Uint8Array(buf);
    view[0] = 0x10; // stabilized
    view[1] = 0x58; // 7000 & 0xFF = 0x58... let's use 7000 = 0x1B58
    view[2] = 0x1B;
    const result = parseScaleData(buf, CHAR_WEIGHT_MEASUREMENT);
    expect(result).not.toBeNull();
    expect(result!.weight).toBe(70.0);
    expect(result!.stabilized).toBe(true);
    expect(result!.source).toBe('weight');
  });

  it('体重秤 lb → 自动转 kg', () => {
    // ctrl=0x18（稳定 + lb）, weight=15432 lb → 70.0 kg
    const buf = new ArrayBuffer(3);
    const view = new Uint8Array(buf);
    view[0] = 0x18; // stabilized + lb
    view[1] = 0x68; // 15432 = 0x3C68
    view[2] = 0x3C;
    const result = parseScaleData(buf, CHAR_WEIGHT_MEASUREMENT);
    expect(result).not.toBeNull();
    expect(result!.weight).toBeGreaterThan(69);
    expect(result!.weight).toBeLessThan(71);
  });

  it('未稳定体重（bit4=0）', () => {
    const buf = new ArrayBuffer(3);
    const view = new Uint8Array(buf);
    view[0] = 0x00; // not stabilized
    view[1] = 0x58;
    view[2] = 0x1B;
    const result = parseScaleData(buf, CHAR_WEIGHT_MEASUREMENT);
    expect(result!.stabilized).toBe(false);
  });

  it('体成分秤 0x2A9C → 解析体重 + 阻抗', () => {
    // 13 bytes: flags + weight(2) + ... + impedance(2 at offset 11-12)
    const buf = new ArrayBuffer(13);
    const view = new Uint8Array(buf);
    view[0] = 0x20; // stabilized (bit5)
    // weight = 70kg → 70/0.01 = 7000 = 0x1B58
    view[1] = 0x58;
    view[2] = 0x1B;
    // impedance at offset 11-12: 480 = 0x01E0
    view[11] = 0xE0;
    view[12] = 0x01;
    const result = parseScaleData(buf, CHAR_BODY_MEASUREMENT);
    expect(result).not.toBeNull();
    expect(result!.weight).toBe(70.0);
    expect(result!.impedance).toBe(480);
    expect(result!.source).toBe('body_composition');
  });

  it('数据过短 → null', () => {
    const buf = new ArrayBuffer(2);
    const result = parseScaleData(buf, CHAR_WEIGHT_MEASUREMENT);
    expect(result).toBeNull();
  });
});

describe('calcBodyComposition', () => {
  it('男性 70kg/170cm/30岁/阻抗480 → 体脂率 10-25% 合理区间', () => {
    const data: ScaleData = { weight: 70, impedance: 480, stabilized: true, source: 'body_composition' };
    const result = calcBodyComposition(data, 170, 'male', 30);
    expect(result.bmi).toBe(24.2);
    expect(result.bodyFat).toBeGreaterThan(5);
    expect(result.bodyFat).toBeLessThan(30);
    expect(result.muscle).toBeGreaterThan(25);
    expect(result.muscle).toBeLessThan(40);
    expect(result.water).toBeGreaterThan(45);
    expect(result.water).toBeLessThan(65);
    expect(result.impedance).toBe(480);
  });

  it('女性 55kg/160cm/25岁/阻抗500 → 体脂率 > 男性同条件', () => {
    const data: ScaleData = { weight: 55, impedance: 500, stabilized: true, source: 'body_composition' };
    const female = calcBodyComposition(data, 160, 'female', 25);
    const male = calcBodyComposition(data, 160, 'male', 25);
    // 女性体脂率天然高于男性
    expect(female.bodyFat).toBeGreaterThan(male.bodyFat);
  });

  it('阻抗缺失 → 只返 BMI', () => {
    const data: ScaleData = { weight: 65, stabilized: true, source: 'weight' };
    const result = calcBodyComposition(data, 170, 'male', 30);
    expect(result.bmi).toBe(22.5);
    expect(result.bodyFat).toBe(0);
    expect(result.muscle).toBe(0);
    expect(result.impedance).toBe(0);
  });

  it('BMI 高 → 内脏脂肪等级高', () => {
    const data: ScaleData = { weight: 100, impedance: 350, stabilized: true, source: 'body_composition' };
    const result = calcBodyComposition(data, 170, 'male', 35);
    const normalData: ScaleData = { weight: 65, impedance: 480, stabilized: true, source: 'body_composition' };
    const normal = calcBodyComposition(normalData, 170, 'male', 30);
    expect(result.visceralFat).toBeGreaterThan(normal.visceralFat);
  });
});
