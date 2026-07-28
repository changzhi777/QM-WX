/**
 * ESLint 配置 — apps/miniprogram（V0.3.29 GAP-E）
 *
 * 范围：
 * - TypeScript（@typescript-eslint，miniprogram-api-typings 替代 React 生态）
 * - 微信小程序 .ts/.wxss/.wxml/.json（不在 eslint 范围 — 用 IDE 格式化）
 * - 关闭与 Prettier 冲突的规则（eslint-config-prettier）
 *
 * 注：app.ts + services/*.ts + utils/*.ts 是 miniprogram 唯一 TS 源码
 *    page/component 主代码是 .wxml（不在 lint 范围）
 */
module.exports = {
  root: true,
  env: {
    browser: true,
    node: true,
    es2022: true,
  },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: false },
  },
  globals: {
    // 微信小程序全局对象（wx, getApp, getCurrentPages, wx.cloud 等）
    wx: 'readonly',
    App: 'readonly',
    Page: 'readonly',
    Component: 'readonly',
    getApp: 'readonly',
    getCurrentPages: 'readonly',
    requirePlugin: 'readonly',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    // 必须放最后，覆盖冲突规则
    'prettier',
  ],
  rules: {
    // TS 用 @typescript-eslint/no-unused-vars 替代
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // 谨慎 any（miniprogram-api-typings 不可避免）
    '@typescript-eslint/no-explicit-any': 'off',
    // wx.* 全局对象已声明在 globals
    'no-undef': 'off',
  },
  overrides: [
    {
      // 测试文件宽松
      files: ['tests/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        'no-empty': 'off',
      },
    },
  ],
  ignorePatterns: [
    'node_modules/**',
    'dist/**',
    // miniprogram_npm 是 IDE 构建产物（不在 lint 范围）
    'miniprogram/miniprogram_npm/**',
    // 测试文件宽松（在 overrides 中）
    'tests/**',
    '*.config.js',
    'coverage/**',
    '.zcf/**',
    // 排除 .wxml/.wxss/.json（非 TS）
    '**/*.wxml',
    '**/*.wxss',
    '**/*.json',
  ],
};