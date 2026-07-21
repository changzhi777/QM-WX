/**
 * common/logger 单测（V0.2.56 补：funcs 66→100%）
 *
 * logger 是对象字面量（info/warn/error 3 方法），jobs/工具代码用。
 * mock console.log/warn/error 验证 JSON 输出格式 + msg 分支。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from '../../src/common/logger.js';

describe('common/logger', () => {
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('info(string) → JSON {level:info, msg, time}', () => {
    logger.info('hello');
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/"level":"info","msg":"hello","time":"/),
    );
  });

  it('info(object, msg) → 展开字段 + → msg 续行', () => {
    logger.info({ userId: 'u1' }, '描述');
    expect(console.log).toHaveBeenCalledWith(expect.stringMatching(/"userId":"u1"/));
    expect(console.log).toHaveBeenCalledWith('  → 描述');
  });

  it('warn(object) → console.warn JSON {level:warn}', () => {
    logger.warn({ x: 1 });
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/"level":"warn","x":1/));
  });

  it('error(object, msg) → console.error + 续行', () => {
    logger.error({ err: 'boom' }, '失败');
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/"level":"error","err":"boom"/));
    expect(console.error).toHaveBeenCalledWith('  → 失败');
  });
});
