/**
 * weekly-report schema 单元测试
 *
 * 覆盖：
 * - 合法 action（currentWeek / myReport / trigger）
 * - 合法 payload（groupId / period 格式）
 * - 非法 action / 非法 period 格式
 */
import { describe, it, expect } from 'vitest';
import { WeeklyReportActionBodySchema } from '../../../src/modules/weekly-report/weekly-report.schema.js';

describe('WeeklyReportActionBodySchema', () => {
  it('currentWeek + 空 payload → ok', () => {
    const r = WeeklyReportActionBodySchema.parse({ action: 'currentWeek' });
    expect(r.action).toBe('currentWeek');
  });

  it('myReport + groupId → ok', () => {
    const r = WeeklyReportActionBodySchema.parse({
      action: 'myReport',
      payload: { groupId: 'g1' },
    });
    expect(r.action).toBe('myReport');
    expect(r.payload?.groupId).toBe('g1');
  });

  it('trigger + 完整 payload → ok', () => {
    const r = WeeklyReportActionBodySchema.parse({
      action: 'trigger',
      payload: { groupId: 'g1', period: '2026-W25' },
    });
    expect(r.action).toBe('trigger');
    expect(r.payload?.period).toBe('2026-W25');
  });

  it('非法 action → 抛 ZodError', () => {
    expect(() =>
      WeeklyReportActionBodySchema.parse({ action: 'wat' }),
    ).toThrow(/Invalid enum value/);
  });

  it('period 格式错（不是 YYYY-Www）→ 抛 ZodError', () => {
    expect(() =>
      WeeklyReportActionBodySchema.parse({
        action: 'trigger',
        payload: { groupId: 'g1', period: '2026-25' },
      }),
    ).toThrow();
  });

  it('缺 action → 抛 ZodError', () => {
    expect(() => WeeklyReportActionBodySchema.parse({})).toThrow();
  });
});
