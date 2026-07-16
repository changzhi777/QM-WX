/**
 * scripts/dev-cli/platform.ts — 微信开发者工具 CLI 平台探针（V0.2.10）
 *
 * 职责：跨平台（macOS / Windows / Linux）解析微信开发者工具 CLI 二进制路径
 * - process.platform → 候选路径列表
 * - fs.existsSync 检查每个候选，返第一个存在
 * - 找不到抛 BinNotFoundError（让 npm scripts 给出明确错误信息）
 *
 * 路径映射表（V0.2.10 沉淀，可迭代）：
 * - macOS:    /Applications/wechatwebdevtools.app/Contents/MacOS/cli（English 名）
 *           + /Applications/微信开发者工具.app/Contents/MacOS/cli（Chinese 名）
 * - Windows: C:\Program Files\Tencent\微信开发者工具\cli.exe（default 安装）
 *           + C:\Program Files (x86)\Tencent\微信开发者工具\cli.exe
 *           + C:\Users\<user>\AppData\Local\Programs\wxdevtools\cli.exe（便携）
 * - Linux:   /opt/wechat-devtools/cli（deb/rpm 包安装）
 *           + /snap/bin/wechat-devtools（snap）
 *
 * 失败：抛 BinNotFoundError 含平台 + 全部尝试路径 — 上层 catch 给用户提示装包。
 */
import { existsSync } from 'node:fs';
import { platform } from 'node:process';

export class BinNotFoundError extends Error {
  readonly platform: NodeJS.Platform;
  readonly attempted: string[];

  constructor(plat: NodeJS.Platform, attempted: string[]) {
    super(
      `未找到微信开发者工具 CLI（平台 ${plat}）。已尝试路径：\n${attempted.map((p) => '  - ' + p).join('\n')}\n请下载安装 https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html`,
    );
    this.name = 'BinNotFoundError';
    this.platform = plat;
    this.attempted = attempted;
  }
}

const CANDIDATES: Record<NodeJS.Platform, string[]> = {
  darwin: [
    '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
    '/Applications/微信开发者工具.app/Contents/MacOS/cli',
    '/Applications/WeChat Developer Tools.app/Contents/MacOS/cli',
  ],
  win32: [
    'C:\\Program Files\\Tencent\\微信开发者工具\\cli.exe',
    'C:\\Program Files (x86)\\Tencent\\微信开发者工具\\cli.exe',
  ],
  linux: [
    '/opt/wechat-devtools/cli',
    '/snap/bin/wechat-devtools',
  ],
  // 其他平台不支持
  aix: [],
  darwin64: [],
  freebsd: [],
  openbsd: [],
  sunos: [],
  haiku: [],
  cygwin: [],
  netbsd: [],
};

/**
 * 获取微信开发者工具 CLI 路径（仅检测，不执行）
 * 找不到时抛 BinNotFoundError（含所有尝试路径）
 */
export function getCliPath(): string {
  const candidates = CANDIDATES[platform] ?? [];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  throw new BinNotFoundError(platform, candidates);
}

/**
 * 列出某平台的所有候选路径（用于错误信息 / 文档生成）
 */
export function listCandidates(plat: NodeJS.Platform = platform): string[] {
  return [...(CANDIDATES[plat] ?? [])];
}

/**
 * 检查 CLI 是否可用（不抛错，返 boolean）
 * 适合打印「💡 检测到微信开发者工具」类提示
 */
export function isCliAvailable(): boolean {
  try {
    getCliPath();
    return true;
  } catch {
    return false;
  }
}
