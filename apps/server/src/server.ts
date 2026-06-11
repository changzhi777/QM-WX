/**
 * Fastify 应用入口
 *
 * 启动顺序：
 * 1. buildApp() 装配
 * 2. listen
 * 3. 启 jobs（BullMQ workers + cron 调度）
 */
import { env } from './config/env.js';
import { buildApp } from './app.js';

try {
  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info(`🚀 @qm-wx/server listening on http://${env.HOST}:${env.PORT}`);

  // 启动 jobs（BullMQ workers + cron 调度）
  const { startJobs, stopJobs } = await import('./jobs/queue.js');
  await startJobs();
  app.log.info('📋 jobs system started (weekly-report queue)');

  // 优雅关闭
  const shutdown = async (signal: string) => {
    app.log.info(`${signal} received, shutting down...`);
    await stopJobs();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
} catch (err) {
  console.error(err);
  process.exit(1);
}
