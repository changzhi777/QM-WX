/**
 * infra/ocr 单测（V0.1.151）
 *
 * 覆盖：
 * - parseSportScore：距离/时长/配速正则（km/公里/mi · h:mm:ss/mm:ss/小时 · 5'30" 等格式）
 * - generalOcr：mock fetch 验证调用 + Response.TextDetections 提取 / Error 抛错
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('src/config/env.js', () => ({
  env: { COS_SECRET_ID: 'AKIDxxxx', COS_SECRET_KEY: 'skey32', COS_REGION: 'ap-guangzhou' },
}));

import { parseSportScore, generalOcr } from 'src/infra/ocr.js';

describe('parseSportScore (V0.1.151)', () => {
  it('距离 km', () => {
    expect(parseSportScore(['10.5 km'])).toMatchObject({ distanceKm: 10.5 });
  });
  it('距离 公里', () => {
    expect(parseSportScore(['半马 21.1公里'])).toMatchObject({ distanceKm: 21.1 });
  });
  it('距离 千米', () => {
    expect(parseSportScore(['5.0千米'])).toMatchObject({ distanceKm: 5.0 });
  });
  it('时长 h:mm:ss', () => {
    expect(parseSportScore(['1:23:45'])).toMatchObject({ durationSec: 5025 });
  });
  it('时长 mm:ss', () => {
    expect(parseSportScore(['用时 23:45'])).toMatchObject({ durationSec: 1425 });
  });
  it('时长 小时分', () => {
    expect(parseSportScore(['1小时30分'])).toMatchObject({ durationSec: 5400 });
  });
  it('配速 5′30″', () => {
    expect(parseSportScore(['配速 5′30″'])).toMatchObject({ paceSecPerKm: 330 });
  });
  it('配速 5\'30"（无分号秒号变体）', () => {
    expect(parseSportScore(["均配 5'30\""])).toMatchObject({ paceSecPerKm: 330 });
  });
  it('无相关文本 → 全 null', () => {
    expect(parseSportScore(['今天天气不错'])).toEqual({
      distanceKm: null,
      durationSec: null,
      paceSecPerKm: null,
    });
  });
  it('组合（距离+时长+配速）', () => {
    const r = parseSportScore(['10.0 km', '用时 55:30', "配速 5'33\""]);
    expect(r).toMatchObject({ distanceKm: 10.0, durationSec: 3330, paceSecPerKm: 333 });
  });
});

describe('generalOcr (V0.1.151)', () => {
  const origFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = origFetch;
  });

  it('调腾讯云 OCR → 返 TextDetections 文本行', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ Response: { TextDetections: [{ DetectedText: '10.5 km' }, { DetectedText: "5'30\"" }] } }),
    });
    const lines = await generalOcr(Buffer.from('fake-img'));
    expect(lines).toEqual(['10.5 km', "5'30\""]);
    expect(global.fetch).toHaveBeenCalled();
  });

  it('Response.Error → throw', async () => {
    (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      json: async () => ({ Response: { Error: { Message: 'InvalidParameter' } } }),
    });
    await expect(generalOcr(Buffer.from('x'))).rejects.toThrow('InvalidParameter');
  });
});
