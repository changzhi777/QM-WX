/**
 * CSV 工具单元测试（V0.1.19）
 *
 * 覆盖：
 * - escapeField 标准 3 类转义（含 , " 换行）
 * - BOM 前缀（Excel 中文兼容）
 * - toCsv 表头 + 多行
 * - null / undefined → 空字段
 */
import { describe, it, expect } from 'vitest';
import { toCsv, toCsvHeader, toCsvRow, UTF8_BOM } from '../../src/common/csv.js';

describe('common/csv · escapeField', () => {
  it('普通字符串不转义', () => {
    expect(toCsvRow(['hello', 'world'])).toBe('hello,world');
  });

  it('含逗号 → 整字段双引号包裹', () => {
    expect(toCsvRow(['a,b'])).toBe('"a,b"');
  });

  it('含双引号 → 内部双引号 → 双引号包裹', () => {
    expect(toCsvRow(['a"b'])).toBe('"a""b"');
  });

  it('含换行 → 整字段双引号包裹', () => {
    expect(toCsvRow(['a\nb'])).toBe('"a\nb"');
    expect(toCsvRow(['a\rb'])).toBe('"a\rb"');
  });

  it('null / undefined → 空字段', () => {
    expect(toCsvRow([null, undefined, 0, ''])).toBe(',,0,');
  });
});

describe('common/csv · header / row', () => {
  it('toCsvHeader 按顺序拼接', () => {
    expect(toCsvHeader(['id', 'name', 'note'])).toBe('id,name,note');
  });

  it('表头含逗号 → 转义', () => {
    expect(toCsvHeader(['id', 'name,chinese'])).toBe('id,"name,chinese"');
  });
});

describe('common/csv · toCsv 全表', () => {
  it('rows + columns 生成 BOM + 表头 + 多行', () => {
    const csv = toCsv(
      [
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob, Jr.', age: 25 },
        { id: 3, name: 'Charlie "C"', age: 35 },
      ],
      [
        { key: 'id', header: 'ID' },
        { key: 'name', header: '姓名' },
        { key: 'age', header: '年龄' },
      ],
    );
    expect(csv.startsWith(UTF8_BOM)).toBe(true);
    // BOM 不计入对比
    const body = csv.slice(UTF8_BOM.length);
    const lines = body.split('\n');
    expect(lines[0]).toBe('ID,姓名,年龄');
    expect(lines[1]).toBe('1,Alice,30');
    expect(lines[2]).toBe('2,"Bob, Jr.",25');
    expect(lines[3]).toBe('3,"Charlie ""C""",35');
  });

  it('空 rows → 只有 BOM + header', () => {
    const csv = toCsv([], [{ key: 'x', header: 'X' }]);
    expect(csv).toBe(UTF8_BOM + 'X');
  });
});