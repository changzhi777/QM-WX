/**
 * common/logger.ts — 轻量 logger（基于 console，jobs / 测试用）
 *
 * 业务代码用 Fastify 的 app.log（pino），这里给 jobs / 工具代码用
 */
export const logger = {
  info: (data: unknown, msg?: string) => {
    if (typeof data === 'string') {
      console.log(JSON.stringify({ level: 'info', msg: data, time: new Date().toISOString() }));
    } else {
      console.log(JSON.stringify({ level: 'info', ...((data as object) ?? {}), time: new Date().toISOString() }));
    }
    if (msg) console.log(`  → ${msg}`);
  },
  warn: (data: unknown, msg?: string) => {
    console.warn(JSON.stringify({ level: 'warn', ...((data as object) ?? {}), time: new Date().toISOString() }));
    if (msg) console.warn(`  → ${msg}`);
  },
  error: (data: unknown, msg?: string) => {
    console.error(JSON.stringify({ level: 'error', ...((data as object) ?? {}), time: new Date().toISOString() }));
    if (msg) console.error(`  → ${msg}`);
  },
};
