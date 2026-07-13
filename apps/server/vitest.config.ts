import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

// vitest.config.ts 在 apps/server/，src/ 在同级
const SRC_DIR = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: [
      // 把 `src/xxx.js` 形式（不带 ./ 前缀，绕开 vite 相对解析）改写到 ./src/xxx.ts
      { find: /^src\/(.+)\.js$/, replacement: resolve(SRC_DIR, '$1.ts') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // e2e 共享真 DB（admin_whitelist / 订单 / 钱包 / ConversationTurn），跨文件并行会相互覆盖状态
    // 全串行保证隔离（unit mock 不连 DB，串行开销小；可靠性 > 速度）
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/server.ts'],
      // 阈值：基于 V0.1.131 后实测（review/auth 扩 + 单测充分）
      // V0.1.112 GAP-3.5: +15 routes 测试文件（routes 全测纳入统计）
      // V0.1.113 review：+service 14 + routes 7 = 21 单测
      // V0.1.129 auth：+routes 7 + login 6 + sms-code 4 = 17 单测
      // V0.1.131 实测: lines 85.14 / functions 86.61 / branches 77.84 / statements 85.14
      // 调整: functions 86 (实测 86.61%, 留 0.61% 缓冲)；其余阈值维持，留 ~1.5% 缓冲
      // wxpay.service funcs 33.77%（mock payment happy path 仍未测）暂不动
      thresholds: {
        lines: 84,
        functions: 86,
        branches: 75,
        statements: 84,
      },
    },
  },
});
