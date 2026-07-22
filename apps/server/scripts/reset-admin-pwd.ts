// 临时脚本：重置 admin 密码（root + admin）。跑完可删。
// 用法: npx tsx scripts/reset-admin-pwd.ts [新密码]
import bcrypt from 'bcrypt';
import { prisma } from '../src/infra/prisma.js';

async function main() {
  const newPwd = process.argv[2] ?? 'Q1w2e3r4r4+';
  const hash = await bcrypt.hash(newPwd, 10);
  const accounts = [
    { username: 'root', role: 'super-admin' },
    { username: 'admin', role: 'admin' },
  ];
  for (const a of accounts) {
    await prisma.admin.upsert({
      where: { username: a.username },
      update: { passwordHash: hash },
      create: { username: a.username, role: a.role, passwordHash: hash },
    });
  }
  console.log(`✓ upsert ${accounts.length} 账号(root super-admin + admin) 密码 → ${newPwd}`);
  const all = await prisma.admin.findMany({
    select: { username: true, role: true, disabled: true },
  });
  console.log('当前 admin 账号:', JSON.stringify(all, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('重置失败:', e);
  process.exit(1);
});
