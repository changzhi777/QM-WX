/**
 * Terra parser 单测（V0.2.70 阶段 3.3）
 * 验证 webhook payload 标准化映射（distance_m→km / source→dataSource / 距离下限）
 */
import { describe, it, expect } from 'vitest';
import { terraActivityToCheckin, mapDataSource } from '../../../src/modules/device/terra.parser.js';

describe('Terra parser (V0.2.70)', () => {
  it('happy: garmin 5km activity → 标准化 terra_garmin', () => {
    const r = terraActivityToCheckin({
      metadata: { summary_id: 'sum-1', start_time: '2026-07-22T08:00:00Z', source: 'garmin' },
      distance: { distance_m: 5000 },
      duration: { duration_s: 1800 },
      heart_rate: { avg_hr_bpm: 150 },
      activity: { type: 'running' },
    });
    expect(r).not.toBeNull();
    expect(r!.distance).toBe(5);
    expect(r!.durationSec).toBe(1800);
    expect(r!.heartRate).toBe(150);
    expect(r!.date).toBe('2026-07-22');
    expect(r!.dataSource).toBe('terra_garmin');
    expect(r!.sportType).toBe('run');
    expect(r!.summaryId).toBe('sum-1');
  });

  it('distance < 0.5km → null（非有效运动）', () => {
    const r = terraActivityToCheckin({
      metadata: { start_time: '2026-07-22', source: 'garmin' },
      distance: { distance_m: 300 }, // 0.3km
    });
    expect(r).toBeNull();
  });

  it('distance_m 缺/0 → null', () => {
    expect(terraActivityToCheckin({ metadata: { source: 'garmin' } })).toBeNull();
    expect(
      terraActivityToCheckin({ metadata: { source: 'garmin' }, distance: { distance_m: 0 } }),
    ).toBeNull();
  });

  it('source 映射各品牌', () => {
    expect(mapDataSource('garmin')).toBe('terra_garmin');
    expect(mapDataSource('COROS')).toBe('terra_coros');
    expect(mapDataSource('suunto')).toBe('terra_suunto');
    expect(mapDataSource('zepp')).toBe('terra_zepp');
    expect(mapDataSource('amazfit')).toBe('terra_zepp');
    expect(mapDataSource('strava')).toBe('terra_strava');
    expect(mapDataSource('unknown_brand')).toBe('terra_unknown_brand');
    expect(mapDataSource(undefined)).toBe('terra');
  });

  it('date 缺失 → 默认今日', () => {
    const r = terraActivityToCheckin({
      metadata: { source: 'coros' },
      distance: { distance_m: 10000 },
    });
    expect(r).not.toBeNull();
    expect(r!.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('distance 四舍五入 1 位小数', () => {
    const r = terraActivityToCheckin({
      metadata: { start_time: '2026-07-22', source: 'garmin' },
      distance: { distance_m: 5234 }, // 5.234km → 5.2
    });
    expect(r!.distance).toBe(5.2);
  });
});
