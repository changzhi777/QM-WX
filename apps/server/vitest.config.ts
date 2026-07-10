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
      // 阈值：基于 V0.1.112 后实测（routes 全测纳入统计）
      // V0.1.112 GAP-3.5: +15 routes 测试文件（switch-action 路由层全覆盖）
      // routes.ts 从 exclude 移除 → 纳入覆盖率统计（29 个 module routes 全测）
      // 实测: lines 85.58 / funcs 88.39 / branches 76.98 / statements 85.58
      // 留 ~1.5% 缓冲给后续重构；wxpay.routes funcs 36%（$transaction happy path 未测）留待后续可选补
      thresholds: {
        lines: 84,
        functions: 87,
        branches: 75,
        statements: 84,
      },
    },
  },
});
