/**
 * 微信小程序截图脚本（V0.2.8）
 * miniprogram-automator → 逐页 reLaunch + screenshot → 一页一图 PNG
 *
 * 用法：node scripts/screenshot-mp.js
 * 前置：微信开发者工具已安装 + 安全设置开启「服务端口」（CLI/HTTP 调用）
 *
 * 四重保护：
 * 1. reLaunch 统一跳转（navigateTo 不能跳 tab 页 + 压栈超 10 层会崩）
 * 2. 单页超时 15s（automator 会话偶发死锁，不让单页卡死整批）
 * 3. 超时自动重连（破除 automator websocket 死锁，继续后续页）
 * 4. 末尾 retry 队列（冷启动/偶发超时落败的页，会话热后再补一次）
 *
 * 注意：miniprogram-automator 0.12.1 跳转方法直接收 url 字符串（非 {url} 对象）
 */
const automator = require('miniprogram-automator');
const path = require('path');
const fs = require('fs');

const CLI_PATH = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const PROJECT_PATH = path.resolve(__dirname, '../apps/miniprogram');
const OUT_DIR = path.resolve(__dirname, '../screenshots');
const PAGE_TIMEOUT = 15000; // 单页上限：reLaunch + 2s 渲染 + screenshot

// 22 页清单（app.json 注册）；详情页带占位参数，避免无参 early-return 或调空接口
const PAGES = [
  'pages/index/index',
  'pages/sport/index',
  'pages/mine/index',
  'pages/profile/index',
  'pages/health/index',
  'pages/device/index',
  'pages/training/index',
  'pages/shoes/index',
  'pages/runner/index',
  'pages/feed/index',
  'pages/user/index?userId=1',
  'pages/ai-coach/index',
  'pages/diet/index',
  'pages/insight/index',
  'pages/report-detail/index?date=2026-07-16',
  'pages/membership/index',
  'pages/ranking/index',
  'pages/content-list/index',
  'pages/onboarding/index',
  'pages/group-detail/index?groupId=1',
  'pages/agreement/index',
  'pages/content-detail/index?contentId=1&type=marathon',
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const pageName = (p) => p.replace(/\?.*$/, '').replace(/\//g, '_');

// 给异步操作套超时，超时则 reject（用于检测 automator 死锁）
const withTimeout = (p, ms, label) =>
  Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error(label + ' 超时 ' + ms + 'ms')), ms)),
  ]);

const connect = () => automator.launch({ cliPath: CLI_PATH, projectPath: PROJECT_PATH });

// 截单页：reLaunch → 等 2s 渲染 → 截图
async function capturePage(mp, page) {
  await mp.reLaunch('/' + page);
  await delay(2000);
  await mp.screenshot({ path: path.join(OUT_DIR, pageName(page) + '.png') });
  return pageName(page);
}

// 跑一批页，返回仍失败的列表（mp 通过闭包变量维护，超时重连会更新它）
async function runBatch(label, pages, state) {
  const stillFailed = [];
  for (const page of pages) {
    try {
      const name = await withTimeout(capturePage(state.mp, page), PAGE_TIMEOUT, page);
      console.log(`✅ ${name}.png${label ? ` (${label})` : ''}`);
      state.ok++;
    } catch (e) {
      console.error(`❌ ${page}: ${e.message}${label ? ` (${label})` : ''}`);
      state.fail++;
      stillFailed.push(page);
      if (/超时|timeout/i.test(e.message)) {
        try { await state.mp.close(); } catch (_) { /* 忽略关闭失败 */ }
        console.log('🔄 死锁，重连...');
        state.mp = await connect();
      }
    }
  }
  return stillFailed;
}

async function main() {
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('🚀 启动微信开发者工具 automator...');
  const state = { mp: await connect(), ok: 0, fail: 0 };
  console.log('✅ 已连接');

  // 主循环
  let failed = await runBatch('', PAGES, state);

  // retry 队列：冷启动/偶发超时落败的页，会话已热再补一次
  if (failed.length) {
    console.log(`\n🔁 重试 ${failed.length} 个失败页...`);
    failed = await runBatch('retry', failed, state);
  }

  try { await state.mp.close(); } catch (_) { /* 忽略 */ }
  console.log(`\n📊 截图完成：成功 ${state.ok} / 失败 ${failed.length} / 共 ${PAGES.length} 页`);
  if (failed.length) console.log(`⚠️ 仍失败：${failed.join(', ')}`);
  console.log(`📁 输出目录：${OUT_DIR}`);
}

main().catch((e) => {
  console.error(' Fatal:', e.message);
  process.exit(1);
});
