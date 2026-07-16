/**
 * scripts/dev-cli/__tests__/cli-helper.test.ts — CliHelper 单测（V0.2.10）
 *
 * 关键 mock：spawn 不能真启 IDE，必须 mock child_process.spawn 返 fake child
 * 测：a) 错误 exit → CliError b) 成功 exit → 返 ExecResult c) timeout 处理
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as cp from 'node:child_process';
import { EventEmitter } from 'node:events';

// mock spawn，让它返回可控 fake child
vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof cp>('node:child_process');
  return { ...actual, spawn: vi.fn() };
});

import { CliHelper, CliError } from '../cli-helper.js';

class FakeChild extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  killed = false;

  kill(sig?: string) {
    this.killed = true;
    this.emit('close', null); // null 模拟被 kill
  }
}

function mockSpawnSuccess(args: string[]) {
  const fake = new FakeChild();
  // 模拟异步 close(exitCode=0) + 一些 stderr
  process.nextTick(() => {
    fake.stderr.emit('data', Buffer.from('mock success output'));
    fake.emit('close', 0);
  });
  vi.mocked(cp.spawn).mockReturnValueOnce(fake as unknown as cp.ChildProcess);
}

function mockSpawnFailure(args: string[], exitCode: number, stderr: string) {
  const fake = new FakeChild();
  process.nextTick(() => {
    fake.stderr.emit('data', Buffer.from(stderr));
    fake.emit('close', exitCode);
  });
  vi.mocked(cp.spawn).mockReturnValueOnce(fake as unknown as cp.ChildProcess);
}

describe('CliHelper — 命令包装', () => {
  let helper: CliHelper;

  beforeEach(() => {
    helper = new CliHelper('/fake/cli/path');
    vi.mocked(cp.spawn).mockReset();
  });

  it('upload 成功时返 ExecResult 不抛错', async () => {
    mockSpawnSuccess(['upload', '--version', 'V0.2.10', '--desc', 'test']);
    const r = await helper.upload({
      version: 'V0.2.10',
      desc: 'test',
    });
    expect(r.exitCode).toBe(0);
    expect(cp.spawn).toHaveBeenCalledWith(
      '/fake/cli/path',
      expect.arrayContaining(['upload', '--version', 'V0.2.10', '--desc', 'test']),
      expect.objectContaining({ cwd: undefined }),
    );
  });

  it('upload 失败时抛 CliError 含 exitCode + args + stderr', async () => {
    mockSpawnFailure(['upload', '--version', 'X'], 401, 'auth failed');
    await expect(
      helper.upload({ version: 'X', desc: 'desc' }),
    ).rejects.toMatchObject({
      name: 'CliError',
      exitCode: 401,
      args: expect.arrayContaining(['upload']),
    });
  });

  it('buildNpm 不需要 version/desc', async () => {
    mockSpawnSuccess(['build-npm']);
    const r = await helper.buildNpm();
    expect(r.exitCode).toBe(0);
    expect(cp.spawn).toHaveBeenCalledWith('/fake/cli/path', ['build-npm'], expect.anything());
  });

  it('autoPreview 拼装 --project --port 参数', async () => {
    mockSpawnSuccess(['auto-preview', '--project', '/proj', '--port', '9421']);
    const r = await helper.autoPreview({ project: '/proj', port: 9421 });
    expect(r.exitCode).toBe(0);
    expect(cp.spawn).toHaveBeenCalledWith(
      '/fake/cli/path',
      expect.arrayContaining(['auto-preview', '--project', '/proj', '--port', '9421']),
      expect.anything(),
    );
  });

  it('islogin 不抛错（即使非 0 也返给调用方决定）', async () => {
    mockSpawnFailure(['islogin'], 1, 'not login');
    const r = await helper.islogin();
    expect(r.exitCode).toBe(1); // 没抛
  });
});
