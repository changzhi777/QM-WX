/**
 * 联调:qmwx 真投递验证(SyncOutbox → flushOutbox → POST 律动)
 *
 * 写 user.upsert + checkin.batch 到 SyncOutbox → 调 ludongService.flushOutbox
 * → HMAC POST 律动 /open/v1/events → 查 SyncOutbox 最终状态(done/failed)。
 *
 * 前置:律动 receiver 起(localhost:8000)、qmwx PG 起、.env 配 LUDONG_*。
 * 跑:cd apps/server && pnpm exec tsx scripts/qa-ludong-flush.ts
 */
import { prisma } from '../src/infra/prisma.js';
import { ludongService } from '../src/modules/ludong/ludong.service.js';

async function main(): Promise<void> {
  console.log('=== 写 2 条 pending SyncOutbox(user 先,checkin 后)===');
  const user = await prisma.syncOutbox.create({
    data: {
      eventType: 'user.upsert',
      path: '/open/v1/events',
      payload: { userId: 'qa_cuid_user_001_xyz_long', nickname: 'QA(qmwx真投递)' },
      status: 'pending',
    },
  });
  await new Promise((r) => setTimeout(r, 20)); // 确保 createdAt 顺序(user 先投)
  const checkin = await prisma.syncOutbox.create({
    data: {
      eventType: 'checkin.batch',
      path: '/open/v1/events',
      payload: {
        userId: 'qa_cuid_user_001_xyz_long',
        checkins: [{ date: '2026-07-08', distanceKm: 10.0, durationSec: 3600 }],
      },
      status: 'pending',
    },
  });
  console.log('  user.upsert  :', user.id);
  console.log('  checkin.batch:', checkin.id);

  console.log('\n=== 调 flushOutbox(qmwx→律动 真投递)===');
  const result = await ludongService.flushOutbox();
  console.log('  result:', result);

  console.log('\n=== SyncOutbox 最终状态 ===');
  const rows = await prisma.syncOutbox.findMany({ orderBy: { createdAt: 'asc' } });
  for (const r of rows) {
    console.log(
      `  ${r.eventType.padEnd(14)} ${r.id}  status=${r.status}` +
        (r.lastError ? `  err=${r.lastError.slice(0, 80)}` : ''),
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
