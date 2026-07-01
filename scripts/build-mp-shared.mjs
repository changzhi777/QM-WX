#!/usr/bin/env node
/**
 * scripts/build-mp-shared.mjs — 预构建 @qm-wx/shared 为微信小程序 CJS 产物
 *
 * 用法：pnpm build:mp-shared
 *
 * 为何存在：微信小程序运行时不支持 node_modules bare import，且 @qm-wx/shared 是
 *   ESM（"type":"module"）+ pnpm workspace 软链，微信原生"构建 npm"对两者支持差。
 *   本脚本用 tsc 把 shared 源码编译成 CJS，模拟微信 miniprogram_npm 产物结构，
 *   让 bare import `@qm-wx/shared`（及子路径 `./api-contracts`）运行时可直接 require。
 *
 * 产物（apps/miniprogram/miniprogram/miniprogram_npm/@qm-wx/shared/）：
 *   index.js / api-contracts/endpoints.js / api-contracts/index.js(兜底)
 *   / constants/{feature-flags,member-levels,points-rules}.js / types/index.js
 *   / package.json（main + exports 双子路径）
 *
 * 生成物，已 .gitignore（根 .gitignore miniprogram_npm/）；shared 改动后重跑本脚本。
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const SHARED_SRC = join(ROOT, 'packages/shared/src');
const OUT_DIR = join(ROOT, 'apps/miniprogram/miniprogram/miniprogram_npm/@qm-wx/shared');

// 临时 tsconfig：commonjs 编译 shared 源码（自包含，隔离 shared 的 ESM 设置）
const tmpTsconfig = join(tmpdir(), `tsconfig-mp-shared-${Date.now()}.json`);
const tsconfig = {
  compilerOptions: {
    module: 'commonjs',
    moduleResolution: 'node',
    target: 'es2018',
    lib: ['es2018', 'dom'], // dom 提供 console 类型（endpoints.ts actionUrl 用 console.warn）
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    rootDir: SHARED_SRC,
    outDir: OUT_DIR,
    declaration: false,
    sourceMap: false,
    isolatedModules: false,
  },
  include: [join(SHARED_SRC, '**/*.ts')],
};

function fail(msg) {
  rmSync(tmpTsconfig, { force: true });
  console.error(`❌ ${msg}`);
  process.exit(1);
}

// 递归遍历目录下所有文件（替代外部 find，跨平台 Win/mac/linux）
function walkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

// 1. 清理旧产物
console.log('▶ [1/5] 清理旧产物');
rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

// 2. 写临时 tsconfig（commonjs）
console.log('▶ [2/5] 写临时 tsconfig（commonjs）');
writeFileSync(tmpTsconfig, JSON.stringify(tsconfig, null, 2));

// 3. tsc 编译 shared 源码 → CJS
console.log('▶ [3/5] tsc 编译 shared → CJS');
const tsc = spawnSync('pnpm', ['exec', 'tsc', '-p', tmpTsconfig], {
  cwd: ROOT,
  stdio: 'inherit',
});
if (tsc.error || tsc.status !== 0) {
  fail(`tsc 编译失败：${tsc.error ? tsc.error.message : `exit ${tsc.status}`}`);
}

// 4. 生成 package.json（main + exports 双子路径）+ api-contracts/index.js 兜底
console.log('▶ [4/5] 生成 package.json + api-contracts 兜底');
writeFileSync(
  join(OUT_DIR, 'package.json'),
  JSON.stringify(
    {
      name: '@qm-wx/shared',
      version: '0.0.0-mp',
      description: 'CJS 预构建产物（供微信小程序 miniprogram_npm 使用，由 scripts/build-mp-shared.mjs 生成）',
      main: 'index.js',
      exports: {
        '.': 'index.js',
        './api-contracts': 'api-contracts/endpoints.js',
      },
    },
    null,
    2,
  ) + '\n',
);
// 兜底：微信旧工具不认 package.json exports 子路径时，目录默认入口 index.js 兜底
mkdirSync(join(OUT_DIR, 'api-contracts'), { recursive: true });
writeFileSync(
  join(OUT_DIR, 'api-contracts/index.js'),
  "// 兜底重导出（防微信旧工具不认 package.json exports 子路径）\nmodule.exports = require('./endpoints.js');\n",
);

// 5. 清理临时 tsconfig + 打印产物
console.log('▶ [5/5] 清理临时 tsconfig + 打印产物');
rmSync(tmpTsconfig, { force: true });

const fileList = walkFiles(OUT_DIR).sort();
console.log(`\n✅ 构建完成，产物（${fileList.length} 文件）：`);
console.log(fileList.map((p) => `   ${p.replace(OUT_DIR, '.')}`).join('\n'));
