/**
 * CSV 序列化工具（V0.1.19）
 *
 * 用于 admin 导出 orders/users 等大表数据。
 * - 流式：分批序列化，避免 OOM
 * - 标准转义：字段含 `,` / `"` / 换行 → 整字段 `"..."` 包裹 + 内部 `"` 转 `""`
 * - BOM 前缀：Excel 打开中文不乱码
 *
 * 用法：
 *   const lines: string[] = [];
 *   lines.push(toCsvHeader(['id', 'name']));
 *   for (const row of rows) lines.push(toCsvRow([row.id, row.name]));
 *   reply.header('Content-Type', 'text/csv; charset=utf-8');
 *   reply.send('﻿' + lines.join('\n'));
 */

/** Excel UTF-8 BOM */
export const UTF8_BOM = '﻿';

/** 字段转义 */
function escapeField(value: unknown): string {
  if (value == null) return '';
  let s = String(value);
  // 含 `,` `"` `\n` `\r` → 整字段 `"..."` 包裹 + 内部 `"` → `""`
  if (/[",\n\r]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** 表头（与 row 顺序对应）*/
export function toCsvHeader(headers: string[]): string {
  return headers.map(escapeField).join(',');
}

/** 一行数据（与 header 顺序对应）*/
export function toCsvRow(row: unknown[]): string {
  return row.map(escapeField).join(',');
}

/**
 * 批量序列化（适用于已 fetch 全部行的情况）
 *
 * @param rows 数据行
 * @param columns 列定义 `[{ key, header }]`，决定取哪个字段 + 表头名
 */
export function toCsv<T>(
  rows: T[],
  columns: { key: keyof T; header: string }[],
): string {
  const lines: string[] = [toCsvHeader(columns.map((c) => c.header))];
  for (const row of rows) {
    lines.push(toCsvRow(columns.map((c) => row[c.key])));
  }
  return UTF8_BOM + lines.join('\n');
}