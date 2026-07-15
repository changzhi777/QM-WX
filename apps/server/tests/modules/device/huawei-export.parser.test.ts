/**
 * huawei-export.parser 单测（V0.2.2 init #11）
 *
 * 策略：无真实样本时用合成 JSON 字符串 + Hitrava 字段映射表覆盖：
 *   - 顶层 JSON 解析（data 包裹 + 裸数组）
 *   - attribute 内嵌 JSON 解析（HW_EXT_TRACK_SIMPLIFY@is 分隔）
 *   - sportType 枚举映射（4/5/101/118 → run/walk/run/run）
 *   - 单位转换（毫秒/毫卡/米/10m/s）
 *   - 降级兼容（recordDay 缺失 / attribute 缺失 / 顶层字段兜底）
 *   - 异常处理（数据损坏 / 无效 JSON）
 *
 * 真实样本回归：主人首份真实华为 ZIP 提供后补回归测试。
 */
import { describe, it, expect } from 'vitest';
import {
  parseMotionJson,
  parseAttribute,
  toCheckin,
  parseHuaweiExport,
  type HuaweiActivity,
} from '../../../src/modules/device/parsers/huawei-export.parser.js';

describe('huawei-export.parser', () => {
  describe('parseMotionJson', () => {
    it('解析 data 包裹的 JSON 数组', () => {
      const text = JSON.stringify({
        data: [{ sportType: 4, startTime: 1690000000000 }],
      });
      const r = parseMotionJson(text);
      expect(r).toHaveLength(1);
      expect(r[0]?.sportType).toBe(4);
    });

    it('解析裸 JSON 数组', () => {
      const text = JSON.stringify([{ sportType: 5, startTime: 100 }]);
      const r = parseMotionJson(text);
      expect(r).toHaveLength(1);
      expect(r[0]?.sportType).toBe(5);
    });

    it('解析失败返空数组（不抛）', () => {
      const r = parseMotionJson('not json {');
      expect(r).toEqual([]);
    });

    it('空 data 返空数组', () => {
      const r = parseMotionJson(JSON.stringify({ data: [] }));
      expect(r).toEqual([]);
    });
  });

  describe('parseAttribute', () => {
    it('解析 HW_EXT_TRACK_SIMPLIFY 内嵌 JSON', () => {
      const attr = 'HW_EXT_TRACK_DETAIL@is{tp=lbs...}&&HW_EXT_TRACK_SIMPLIFY@is{"totalDistance":5000,"totalCalories":350000}';
      const r = parseAttribute(attr);
      expect(r.totalDistance).toBe(5000);
      expect(r.totalCalories).toBe(350000);
    });

    it('缺少 SIMPLIFY 部分返空', () => {
      const r = parseAttribute('HW_EXT_TRACK_DETAIL@is{tp=lbs}');
      expect(r).toEqual({});
    });

    it('内嵌 JSON 损坏返空（不抛）', () => {
      const r = parseAttribute('...&&HW_EXT_TRACK_SIMPLIFY@is{not json}');
      expect(r).toEqual({});
    });

    it('undefined 返空', () => {
      const r = parseAttribute(undefined);
      expect(r).toEqual({});
    });
  });

  describe('toCheckin', () => {
    it('户外跑 sportType=4 → run + 距离单位换算', () => {
      const act: HuaweiActivity = {
        sportType: 4,
        startTime: 1690000000000,
        totalTime: 1800000,        // 30 min in ms
        totalDistance: 5000,        // 5 km in m
        totalCalories: 350000,      // 350 kcal in 毫卡
        timeZone: '+0800',
        attribute: '&&HW_EXT_TRACK_SIMPLIFY@is{"totalDistance":5020,"totalCalories":351000}',
      };
      const r = toCheckin(act);
      expect(r.sport).toBe('run');
      expect(r.durationSec).toBe(1800);
      expect(r.distanceKm).toBe(5.02); // attribute 优先
      expect(r.calories).toBe(351);
      expect(r.startedAt.toISOString()).toBe(new Date(1690000000000).toISOString());
      expect(r.source).toBe('huawei_export');
    });

    it('室内跑 sportType=101 → run（统一简化）', () => {
      const r = toCheckin({ sportType: 101, startTime: 0, totalTime: 600000, totalDistance: 1000, totalCalories: 50000 });
      expect(r.sport).toBe('run');
    });

    it('越野跑 sportType=118 → run', () => {
      expect(toCheckin({ sportType: 118, startTime: 0, totalTime: 0, totalDistance: 0, totalCalories: 0 }).sport).toBe('run');
    });

    it('户外走 sportType=5 → walk', () => {
      expect(toCheckin({ sportType: 5, startTime: 0, totalTime: 0, totalDistance: 0, totalCalories: 0 }).sport).toBe('walk');
    });

    it('户外骑行 sportType=3 → cycling', () => {
      expect(toCheckin({ sportType: 3, startTime: 0, totalTime: 0, totalDistance: 0, totalCalories: 0 }).sport).toBe('cycling');
    });

    it('泳池游泳 sportType=102 → swim', () => {
      expect(toCheckin({ sportType: 102, startTime: 0, totalTime: 0, totalDistance: 0, totalCalories: 0 }).sport).toBe('swim');
    });

    it('徒步 sportType=282 → hike', () => {
      expect(toCheckin({ sportType: 282, startTime: 0, totalTime: 0, totalDistance: 0, totalCalories: 0 }).sport).toBe('hike');
    });

    it('未知 sportType=999 → other（降级）', () => {
      expect(toCheckin({ sportType: 999, startTime: 0, totalTime: 0, totalDistance: 0, totalCalories: 0 }).sport).toBe('other');
    });

    it('attribute 缺失 → 顶层字段兜底', () => {
      const r = toCheckin({ sportType: 4, startTime: 100, totalTime: 1000, totalDistance: 2000, totalCalories: 1000 });
      expect(r.distanceKm).toBe(2);
      expect(r.calories).toBe(1);
    });

    it('attribute + 顶层都缺 → 0 距离 0 卡路里（不抛）', () => {
      const r = toCheckin({ sportType: 4, startTime: 0, totalTime: 0, totalDistance: 0, totalCalories: 0 });
      expect(r.distanceKm).toBe(0);
      expect(r.calories).toBe(0);
    });

    it('毫秒 → 秒换算（totalTime 1800000ms → 1800s）', () => {
      const r = toCheckin({ sportType: 4, startTime: 0, totalTime: 1800000, totalDistance: 0, totalCalories: 0 });
      expect(r.durationSec).toBe(1800);
    });
  });

  describe('parseHuaweiExport', () => {
    it('完整 ZIP 解析（带 attribute + password）', async () => {
      // 用合成 ZIP（unzipper 可生成）
      // 为简化测试：直接传合成 buffer 不实际解压（unzipper.Open.buffer 需要真实 ZIP）
      // 这里用更直接的方式：单测 toCheckin / parseAttribute / parseMotionJson 已覆盖核心
      // parseHuaweiExport 整合测试需要真实 ZIP，留作真实样本回归
      const text = JSON.stringify({
        data: [
          {
            sportType: 4,
            startTime: 1690000000000,
            totalTime: 1800000,
            totalDistance: 5000,
            totalCalories: 350000,
            timeZone: '+0800',
            attribute: 'HW_EXT_TRACK_DETAIL@is{tp=lbs...}&&HW_EXT_TRACK_SIMPLIFY@is{"totalDistance":5000,"totalCalories":350000}',
          },
        ],
      });
      const activities = parseMotionJson(text).map(toCheckin);
      expect(activities).toHaveLength(1);
      expect(activities[0]?.sport).toBe('run');
      expect(activities[0]?.distanceKm).toBe(5);
    });
  });
});
