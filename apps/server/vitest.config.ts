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
      // 阈值：基于 V0.1.111 后实测（jobs/ 全测）
      // 当前实测: lines 80.92 / funcs 86.74 / branches 75.93 / statements 80.92
      // V0.1.111 GAP-3.4: +8 单测（garmin 5 + scheduler 3）
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
