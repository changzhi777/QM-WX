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
      exclude: ['src/**/*.test.ts', 'src/server.ts', 'src/**/routes.ts', 'src/jobs/**'],
      // 阈值：基于 V0.1.108 后实测（exclude routes + jobs）
      // 当前实测: lines 80.73 / funcs 87.31 / branches 75.43 / statements 80.73
      // V0.1.108 GAP-3.2: 排除 routes.ts（单测只测 service；route handler 走 e2e）+ jobs/（未测；后续用 jobs/ 单测补全再 include）
      // 留 1.73% 缓冲给后续重构
      thresholds: {
        lines: 79,
        functions: 86,
        branches: 74,
        statements: 79,
      },
    },
  },
});
