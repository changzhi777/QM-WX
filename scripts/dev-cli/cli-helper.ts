/**
 * scripts/dev-cli/cli-helper.ts — CLI 调用包装层（V0.2.10）
 *
 * 职责：把 spawn CLI 子进程的命令封装成 JS 方法 + Promise 接口 + 错误处理。
 *
 * 设计原则（CLAUDE.md 设计原则：服务端权威 + 能力边界）：
 * - 透明 spawn：所有 stdout/stderr 默认 pipe 到父进程（用户体验：实时看到 cli 输出）
 * - 错误处理：非零 exit code 抛 CliError，包含完整 args + exitCode + stderr 截断
 * - 长 timeout：upload/preview 可能久，默认 5 分钟可配置
 * - 类型友好：命令签名以参数对象形式定义，避免位置参数歧义
 */
import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { getCliPath } from './platform.js';

export interface CliOptions {
  cwd?: string;
  /** ms，默认 5 分钟（upload/preview 可能久） */
  timeoutMs?: number;
  /** spawn 时是否 attach stdin（默认 true，让用户在父进程交互） */
  stdio?: SpawnOptions['stdio'];
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export class CliError extends Error {
  readonly args: string[];
  readonly exitCode: number;
  readonly stderr: string;

  constructor(args: string[], exitCode: number, stderr: string) {
    super(
      `微信开发者工具 CLI 调用失败（exit ${exitCode}）\n命令：${args.join(' ')}\nstderr 尾部：\n${stderr.slice(-1000)}`,
    );
    this.name = 'CliError';
    this.args = args;
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}

export class CliHelper {
  private readonly cliPath: string;

  constructor(cliPath?: string) {
    this.cliPath = cliPath ?? getCliPath();
  }

  /**
   * 私有：spawn 并 await，返 stdout/stderr/exitCode
   * 默认 inherit（用户能看到 cli 实时输出）
   */
  private async exec(args: string[], opts: CliOptions = {}): Promise<ExecResult> {
    const full = [this.cliPath, ...args];
    const stdio = opts.stdio ?? ['inherit', 'inherit', 'pipe'];

    return new Promise<ExecResult>((resolveExec, rejectExec) => {
      const child = spawn(this.cliPath, args, {
        cwd: opts.cwd,
        stdio,
        shell: false,
      });

      let stdout = '';
      let stderr = '';
      if (child.stdout) child.stdout.on('data', (b: Buffer) => (stdout += b.toString()));
      if (child.stderr) child.stderr.on('data', (b: Buffer) => (stderr += b.toString()));

      const timeoutMs = opts.timeoutMs ?? 5 * 60 * 1000;
      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        rejectExec(new Error(`CLI 调用超时（>${timeoutMs}ms）：${full.join(' ')}`));
      }, timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        const exitCode = code ?? 0;
        // 即使 exit=0 也返，调用方按需决定是否抛
        resolveExec({ exitCode, stdout, stderr });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        rejectExec(err);
      });
    });
  }

  /**
   * 调用 CLI 并在 exitCode != 0 时抛 CliError
   */
  private async run(args: string[], opts: CliOptions = {}): Promise<ExecResult> {
    const result = await this.exec(args, opts);
    if (result.exitCode !== 0) {
      throw new CliError(args, result.exitCode, result.stderr);
    }
    return result;
  }

  // ───── 公开 API ──────────────────────────────────────────────

  /** 打开 IDE + 打开项目（仅 macOS 支持 Windows/Linux 自动启动 IDE） */
  async open(opts: { project?: string; port?: number } = {}): Promise<ExecResult> {
    const args = ['open'];
    if (opts.project) args.push('--project', opts.project);
    if (opts.port !== undefined) args.push('--port', String(opts.port));
    return this.run(args);
  }

  /** re-login（自动打开 IDE 后调用扫码登录） */
  async login(): Promise<ExecResult> {
    return this.run(['login']);
  }

  /** 是否已登录（exit 0 = 已登录；非 0 = 未登录或未启动 IDE） */
  async islogin(): Promise<ExecResult> {
    return this.exec(['islogin']); // 注意：故意不 run 因为 1 也算正常
  }

  /** 启动 IDE HTTP 自动化模式（不抛错） */
  async auto(port: number): Promise<ExecResult> {
    return this.run(['auto', '--port', String(port)]);
  }

  /** 普通预览（生成二维码给手机扫码） */
  async preview(opts: { project?: string; port?: number } = {}): Promise<ExecResult> {
    const args = ['preview'];
    if (opts.project) args.push('--project', opts.project);
    if (opts.port !== undefined) args.push('--port', String(opts.port));
    return this.run(args);
  }

  /** 自动预览（拉起模拟器，无需扫码） */
  async autoPreview(opts: { project?: string; port?: number } = {}): Promise<ExecResult> {
    const args = ['auto-preview'];
    if (opts.project) args.push('--project', opts.project);
    if (opts.port !== undefined) args.push('--port', String(opts.port));
    return this.run(args);
  }

  /** 上传小程序（体验版 / 正式版） */
  async upload(opts: {
    project?: string;
    port?: number;
    version: string;
    desc: string;
  }): Promise<ExecResult> {
    const args = ['upload'];
    if (opts.project) args.push('--project', opts.project);
    if (opts.port !== undefined) args.push('--port', String(opts.port));
    args.push('--version', opts.version, '--desc', opts.desc);
    return this.run(args);
  }

  /** 构建 npm（V0.1.150 起 mp-shared 注入流程需要） */
  async buildNpm(opts: { project?: string } = {}): Promise<ExecResult> {
    const args = ['build-npm'];
    if (opts.project) args.push('--project', opts.project);
    return this.run(args);
  }

  /** 关闭项目（close vs quit：close 只关 IDE 窗口，quit 退出整个 IDE） */
  async close(): Promise<ExecResult> {
    return this.run(['close']);
  }

  async quit(): Promise<ExecResult> {
    return this.run(['quit']);
  }

  /** 清理 IDE 缓存（cache 子命令） */
  async cache(): Promise<ExecResult> {
    return this.run(['cache']);
  }

  /** 子命令：lint 验证 */
  async engine(): Promise<ExecResult> {
    return this.run(['engine']);
  }
}
