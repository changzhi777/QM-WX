/**
 * infra/ocr 单测 — V0.2.1（parseSportScore 纯函数）
 *
 * V0.2.1 变更：OCR 调用迁移到 modules/ocr（官方 SDK），本文件只测 parseSportScore 正则。
 * generalOcr / TC3 签名测试已随迁移移除（SDK 由 modules/ocr/ocr.service.test 覆盖）。
 */
import { describe, it, expect } from 'vitest';
import { parseSportScore } from 'src/infra/ocr.js';

describe('parseSportScore', () => {
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
  it("配速 5'30\"（无分号秒号变体）", () => {
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
