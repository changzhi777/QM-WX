// 微信开发者工具 automator 探针 — 抓首页 Console 诊断「加载首页数据失败」
//
// 前置：开发者工具 → 设置 → 安全 → 开启「服务端口」
// 跑法：node scripts/mp-probe.mjs
import automator from 'miniprogram-automator';

const CLI = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli';
const PROJECT = '/Users/mac/Documents/Claude/Projects/QM-WX/apps/miniprogram';

console.log('[probe] 启动 automator...');
const mini = await automator.launch({ cliPath: CLI, projectPath: PROJECT });

const logs = [];
mini.on('console', (m) => {
  const text = typeof m.text === 'string' ? m.text : JSON.stringify(m.text);
  logs.push(`[${m.type}] ${text}`);
});

// 等 app.onLaunch + 首页 onLoad + API 请求完成
console.log('[probe] 等待首页加载 6s...');
await new Promise((r) => setTimeout(r, 6000));

console.log('\n===== 首页 Console 抓取 =====');
console.log(logs.join('\n') || '(无 console 输出)');

const page = await mini.currentPage();
console.log('\n===== 当前页面 =====');
console.log('route:', page.path);

await mini.close();
console.log('[probe] 完成');
