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
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/server.ts', 'src/**/routes.ts'],
      // 阈值：基于 V0.1.110 后实测（include jobs/）
      // 当前实测: lines 80.08 / funcs 86.46 / branches 75.77 / statements 80.08
      // V0.1.110 GAP-3.3: include src/jobs/**（+7 单测：refresh-certs 2 + close-order 4 + ludong-sync 1）
      // 留 1.08% 缓冲给后续重构
      thresholds: {
        lines: 79,
        functions: 85,
        branches: 74,
        statements: 79,
      },
    },
  },
});
