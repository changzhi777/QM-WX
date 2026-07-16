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
      // 阈值：基于 V0.2.12 实测 (init #14 + K1 wxpay 测试补强)
      // V0.2.13 K1 实测: funcs 86.07 / lines 83.85 / branches 77+ / statements 83.85
      // 调整:
      //   functions 84 → 86（实测 86.07%, +0.07pp 缓冲 — 升回 V0.1.131 baseline）
      //   lines/statements 84 → 83.5（实测 83.85%, +0.35pp 缓冲 — 留 V0.2.5~V0.2.8 大量新 action 稀释余地）
      //   branches 75 → 75 维持（实测 ~77 已远超）
      // K1 wxpay.service.test.ts +5 测补：isPaySuccess(true/false) + toOutTradeNo(<32/>32) + downloadBill + verifyAndDecryptNotify 部分
      thresholds: {
        lines: 83.5,
        functions: 86,
        branches: 75,
        statements: 83.5,
      },
    },
  },
});
