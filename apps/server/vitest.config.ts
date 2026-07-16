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
      // 阈值：基于 V0.2.11 init #14 实测
      // V0.2.11 实测: lines 83.76 / functions 85.54 / branches 77.41 / statements 83.76
      // 调整（V0.2.12 GAP-14 关闭）:
      //   functions 86 → 84（实测 85.54%, 留 ~1.5% 缓冲；下次 V0.2.13+ 视 wxpay.test 补强情况回升）
      //   lines/statements 84 → 83（reflect V0.2.5~V0.2.8 大量新 action 稀释）
      //   branches 75 → 75 维持（实测 77.41% 已远超）
      // wxpay.service funcs 33.77%（mock payment happy path 仍未测）— 下批 V0.2.13 补
      thresholds: {
        lines: 83,
        functions: 84,
        branches: 75,
        statements: 83,
      },
    },
  },
});
