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
      exclude: ['src/**/*.test.ts', 'src/server.ts'],
      // 阈值：略低于当前实测值，给后续重构留点缓冲空间
      // 当前实测：lines 79.66 / funcs 64.6 / branches 87.8
      thresholds: {
        lines: 75,
        functions: 60,
        branches: 80,
        statements: 75,
      },
    },
  },
});
