/**
 * shared 包 vitest 配置
 *
 * 关键点：包内源码用 ESM 标准 `.js` 后缀（TypeScript 项目推荐写法），
 * vitest 跑测试时要把 .js 后缀改写为 .ts 解析。
 *
 * ⚠️ 锚定相对路径前缀（`./` 或 `../`），避免误伤 vitest 自身 chunk：
 *     vitest 内部 `import './spy.js'` 必须解析为 `./spy.js`（真实文件），
 *     绝不能被改写成 `./spy.ts`。
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: [
      // 匹配相对路径（`./xxx.js` / `../xxx.js` / `../../xxx.js` ...）→ 改写为 .ts
      // 显式锚定 `^\.{1,2}/` 前缀，避免 vitest 内部 `import './spy.js'` 被误伤
      { find: /^(\.{1,2}\/.+)\.js$/, replacement: '$1.ts' },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
