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
      // 阈值：低于当前实测 ~1.58%，给后续重构留缓冲
      // 当前实测 (V0.1.101 后): lines 79.58 / funcs 85.51 / branches 76.09 / statements 79.58
      // 注释：routes.ts 普遍 13-19% 拉低全局（单测只测 service 不测 route handler），jobs/ 62.72% 未测
      // 调高阈值需先补 routes/jobs 测试或改为按 module exclude（暂 YAGNI，留待 GAP-3.2）
      thresholds: {
        lines: 78,
        functions: 80,
        branches: 75,
        statements: 78,
      },
    },
  },
});
