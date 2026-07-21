/**
 * scripts/dev-cli/index.ts — 微信开发者工具 CLI 入口（V0.2.10）
 *
 * 用法：
 *   node scripts/dev-cli/index.ts <cmd> [options]
 *   pnpm wx:<cmd>            # npm scripts 转发（推荐）
 *   ./bin/wx <cmd>           # bin 入口（裸调）
 *
 * 示例：
 *   pnpm wx:auto-preview                  # 自动预览（拉起模拟器）
 *   pnpm wx:upload --version V0.2.10     # 上传体验版
 *   pnpm wx:build-npm                     # 构建 npm
 *
 * 命令清单：
 *   open / login / islogin / close / quit / cache / engine
 *   auto        启动 IDE HTTP server
 *   preview     普通预览（生成二维码）
 *   auto-preview 自动预览（拉模拟器）
 *   upload      上传
 *   build-npm   构建 npm
 */
import { Command } from 'commander';
import { CliHelper, CliError } from './cli-helper.js';
import { BinNotFoundError, isCliAvailable } from './platform.js';
import { DEFAULT_PORT, DEFAULT_PROJECT_ROOT, HELP_PORT_HINT, HELP_PROJECT_HINT } from './paths.js';

const program = new Command();
program
  .name('wx')
  .description('微信开发者工具 CLI 包装层（V0.2.10 — 双模式 + 跨平台）')
  .version('0.2.10');

const projectOpt = (cmd: Command) =>
  cmd.option('-p, --project <path>', HELP_PROJECT_HINT, DEFAULT_PROJECT_ROOT);

const portOpt = (cmd: Command) =>
  cmd.option('--port <n>', HELP_PORT_HINT, (v) => Number.parseInt(v, 10), DEFAULT_PORT);

projectOpt(portOpt(program.command('open').description('打开 IDE + 打开项目（自动启动 IDE）')))
  .action(async (opts: { project: string; port: number }) => {
    const helper = new CliHelper();
    await helper.open({ project: opts.project, port: opts.port });
  });

program
  .command('login')
  .description('re-login IDE（扫码登录）')
  .action(async () => {
    const helper = new CliHelper();
    await helper.login();
  });

program
  .command('islogin')
  .description('是否已登录（exit 0 = 是；非 0 = 否或 IDE 未启动）')
  .action(async () => {
    const helper = new CliHelper();
    const r = await helper.islogin();
    console.log(r.exitCode === 0 ? '✅ 已登录' : '❌ 未登录或 IDE 未启动');
    process.exit(r.exitCode);
  });

program
  .command('auto')
  .description('启动 IDE HTTP server（CLI 模式 hook）')
  .option('--port <n>', HELP_PORT_HINT, (v) => Number.parseInt(v, 10), DEFAULT_PORT)
  .action(async (opts: { port: number }) => {
    const helper = new CliHelper();
    await helper.auto(opts.port);
  });

projectOpt(portOpt(program.command('preview').description('普通预览（生成二维码给手机扫码）')))
  .action(async (opts: { project: string; port: number }) => {
    const helper = new CliHelper();
    await helper.preview({ project: opts.project, port: opts.port });
  });

projectOpt(
  portOpt(program.command('auto-preview').description('自动预览（拉起模拟器，无需扫码） — 最常用')),
).action(async (opts: { project: string; port: number }) => {
  const helper = new CliHelper();
  await helper.autoPreview({ project: opts.project, port: opts.port });
});

projectOpt(
  portOpt(
    program
      .command('upload')
      .description('上传小程序（体验版 / 正式版）')
      .requiredOption('-v, --ver <ver>', '版本号，如 V0.2.10（V0.2.61 修：避 program -V 冲突）')
      .requiredOption('-d, --desc <desc>', '版本说明'),
  ),
).action(
  async (opts: { project: string; port: number; ver: string; desc: string }) => {
    const helper = new CliHelper();
    await helper.upload({
      project: opts.project,
      port: opts.port,
      version: opts.ver,
      desc: opts.desc,
    });
  },
);

projectOpt(program.command('build-npm').description('构建 npm（V0.1.150 mp-shared 注入需要）'))
  .action(async (opts: { project: string }) => {
    const helper = new CliHelper();
    await helper.buildNpm({ project: opts.project });
  });

program
  .command('close')
  .description('关闭 IDE 当前项目窗口（不退出 IDE）')
  .action(async () => {
    const helper = new CliHelper();
    await helper.close();
  });

program
  .command('quit')
  .description('完全退出 IDE')
  .action(async () => {
    const helper = new CliHelper();
    await helper.quit();
  });

program
  .command('cache')
  .description('清理 IDE 缓存')
  .action(async () => {
    const helper = new CliHelper();
    await helper.cache();
  });

program
  .command('engine')
  .description('引擎相关（V0.2.10 占位）')
  .action(async () => {
    const helper = new CliHelper();
    await helper.engine();
  });

program
  .command('status')
  .description('健康检查：CLI 是否安装 + IDE 是否登录')
  .action(async () => {
    if (!isCliAvailable()) {
      console.error('❌ 微信开发者工具未安装。下载：https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html');
      process.exit(1);
    }
    console.log('✅ 微信开发者工具 CLI 可用');
    const helper = new CliHelper();
    const r = await helper.islogin();
    console.log(r.exitCode === 0 ? '✅ 已登录' : '⚠️  未登录（先跑 `pnpm wx:auto` 启动 IDE 后再扫码）');
    process.exit(0);
  });

// 顶层错误处理：让用户看到清晰错误，不要让 commander 抛 raw stack
process.on('uncaughtException', (err) => {
  if (err instanceof BinNotFoundError) {
    console.error('❌ ' + err.message);
    process.exit(2);
  }
  if (err instanceof CliError) {
    console.error('❌ ' + err.message);
    process.exit(err.exitCode || 1);
  }
  console.error('💥 未预期错误：', err);
  process.exit(99);
});

await program.parseAsync(process.argv);
