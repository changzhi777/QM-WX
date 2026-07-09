/**
 * 临时测试脚本：直接调 importXiaomiZip 解析小米 ZIP（绕过 nginx + multipart + 鉴权）
 *
 * 用法：tsx scripts/test-xiaomi-import.ts <zipPath> <userId>
 * 容器内：cd /app/apps/server && ./node_modules/.bin/tsx scripts/test-xiaomi-import.ts /tmp/xiaomi.zip <userId>
 */
import { readFileSync } from 'node:fs';
import { deviceService } from '../src/modules/device/device.service.js';

async function main() {
  const zipPath = process.argv[2];
  const userId = process.argv[3];
  const password = process.argv[4] ?? '';
  if (!zipPath || !userId) {
    console.error('用法: tsx test-xiaomi-import.ts <zipPath> <userId> [password]');
    process.exit(1);
  }
  const buffer = readFileSync(zipPath);
  console.log(`ZIP 大小: ${(buffer.length / 1024 / 1024).toFixed(2)} MB, 密码: ${password ? '有' : '无'}`);
  const result = await deviceService.importXiaomiZip(userId, buffer, password);
  console.log('导入结果:', JSON.stringify(result));
  process.exit(0);
}

main().catch((e) => {
  console.error('导入失败:', e);
  process.exit(1);
});
