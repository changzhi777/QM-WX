/**
 * scripts/dev-cli/paths.ts — 默认配置常量（V0.2.10）
 *
 * 单一数据源：所有 dev-cli 命令的默认值在此。
 * CLI 参数 + npm scripts 转发 + 测试 fixture 都从这里读。
 */
import { resolve } from 'node:path';

/**
 * IDE HTTP server 端口（微信开发者工具自动模式端口）
 * 微信开发者工具 `cli auto --port <n>` 默认推荐 9421（官方文档示例）。
 */
export const DEFAULT_PORT = 9421;

/**
 * 项目根目录（绝对路径，解析自当前包根）
 * 微信开发者工具 miniProgramRoot 期望绝对路径。
 */
export const DEFAULT_PROJECT_ROOT = resolve(process.cwd(), 'apps/miniprogram/miniprogram');

/**
 * 帮助提示文本（被 cli-helper + docs 引用）
 */
export const HELP_PROJECT_HINT = '小程序项目根目录（默认 ./apps/miniprogram/miniprogram）';
export const HELP_PORT_HINT = 'IDE HTTP server 端口（默认 9421）';
