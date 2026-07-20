/**
 * V0.2.47 GAP-17 K3 华为真实 ZIP 回归脚本（一次性，不入库）
 *
 * 用法：pnpm -C apps/server exec tsx scripts/test-huawei-real.ts "<zip 绝对路径>"
 *
 * 验证 parseHuaweiExport TCX fallback 对真实 exportSportData ZIP（1633 .tcx）的解析。
 */
import { readFileSync } from 'node:fs';
import { parseHuaweiExport } from '../src/modules/device/parsers/huawei-export.parser.js';

const zipPath = process.argv[2];
if (!zipPath) {
  console.error('用法: tsx scripts/test-huawei-real.ts <zip 路径>');
  process.exit(1);
}

const buf = readFileSync(zipPath);
const r = await parseHuaweiExport(buf);

console.log('=== GAP-17 K3 华为真实 ZIP 回归（V0.2.47 TCX fallback）===');
console.log('rawCount（解析出的活动总数）:', r.rawCount);
console.log('filteredCount（distanceKm > 0 的有效活动）:', r.filteredCount);

const bySport: Record<string, number> = {};
const byYear: Record<string, number> = {};
for (const a of r.activities) {
  bySport[a.sport] = (bySport[a.sport] ?? 0) + 1;
  const y = a.startedAt.getFullYear();
  byYear[y] = (byYear[y] ?? 0) + 1;
}
console.log('按运动类型分布:', bySport);
console.log('按年份分布:', byYear);

const totalKm = r.activities.reduce((s, a) => s + a.distanceKm, 0);
const totalDur = r.activities.reduce((s, a) => s + a.durationSec, 0);
console.log('累计总距离:', Math.round(totalKm), 'km');
console.log('累计总时长:', Math.round(totalDur / 3600), '小时');

console.log(
  '前 5 条样本:',
  r.activities.slice(0, 5).map((a) => ({
    sport: a.sport,
    date: a.startedAt.toISOString().slice(0, 10),
    km: Math.round(a.distanceKm * 100) / 100,
    dur: a.durationSec,
    hr: (a.raw as { avgHr?: number }).avgHr,
  })),
);
