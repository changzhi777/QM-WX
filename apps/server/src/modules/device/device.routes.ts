/**
 * device module routes — POST /api/device
 *
 * Phase 6 实现。当前全 stub。
 */
import type { FastifyInstance } from 'fastify';
import { deviceService } from './device.service.js';
import { Errors } from '../../common/errors.js';
import {
  ListBindingsInputSchema,
  StartOAuthInputSchema,
  SyncWeRunInputSchema,
  MyWeRunQuerySchema,
  UnbindInputSchema,
  BindBleDeviceInputSchema,
  SubmitHeartRateInputSchema,
  SubmitSpO2InputSchema,
  MyHealthHistoryQuerySchema,
  MyActivitiesQuerySchema,
  MySleepQuerySchema,
  MyMetricsQuerySchema,
  MyFitnessAgeQuerySchema,
  ActivityPageQuerySchema,
  IgnoreActivityInputSchema,
  ImportToCheckinInputSchema,
} from './device.schema.js';

export async function deviceRoutes(app: FastifyInstance) {
  app.post(
    '/',
    async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const userId = req.user.id;
      const { action, payload } = req.body as { action: string; payload?: unknown };

      switch (action) {
        case 'listBindings': {
          ListBindingsInputSchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.listBindings(userId) };
        }
        case 'startOAuth': {
          const input = StartOAuthInputSchema.parse(payload);
          return { code: 0, data: await deviceService.startOAuth(userId, input) };
        }
        case 'unbind': {
          const input = UnbindInputSchema.parse(payload);
          return { code: 0, data: await deviceService.unbind(userId, input.vendor) };
        }
        case 'syncWeRun': {
          const input = SyncWeRunInputSchema.parse(payload);
          return { code: 0, data: await deviceService.syncWeRun(userId, input) };
        }
        case 'submitHeartRate': {
          const input = SubmitHeartRateInputSchema.parse(payload);
          return { code: 0, data: await deviceService.submitHeartRate(userId, input) };
        }
        case 'submitSpO2': {
          const input = SubmitSpO2InputSchema.parse(payload);
          return { code: 0, data: await deviceService.submitSpO2(userId, input) };
        }
        case 'myHealthHistory': {
          const input = MyHealthHistoryQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myHealthHistory(userId, input) };
        }
        case 'bindBleDevice': {
          const input = BindBleDeviceInputSchema.parse(payload);
          return { code: 0, data: await deviceService.bindBleDevice(userId, input) };
        }
        case 'myBindings': {
          return { code: 0, data: await deviceService.myBindings(userId) };
        }
        // 佳明数据查询（B-2，2026-07-01）
        case 'myActivities': {
          const input = MyActivitiesQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myActivities(userId, input) };
        }
        case 'mySleep': {
          const input = MySleepQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.mySleep(userId, input) };
        }
        case 'myMetrics': {
          const input = MyMetricsQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myMetrics(userId, input) };
        }
        case 'myFitnessAge': {
          const input = MyFitnessAgeQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myFitnessAge(userId, input) };
        }
        case 'myTodayHealth': {
          // 无入参 — 后端聚合睡眠/健身年龄/训练指标/今日活动（V0.1.25，参考图 2774）
          return { code: 0, data: await deviceService.myTodayHealth(userId) };
        }
        case 'myWeRun': {
          // V0.1.43 微信运动历史步数
          const input = MyWeRunQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myWeRun(userId, input) };
        }
        case 'myPending': {
          const input = ActivityPageQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myPending(userId, input) };
        }
        case 'myProcessed': {
          const input = ActivityPageQuerySchema.parse(payload ?? {});
          return { code: 0, data: await deviceService.myProcessed(userId, input) };
        }
        case 'ignoreActivity': {
          const input = IgnoreActivityInputSchema.parse(payload);
          return { code: 0, data: await deviceService.ignoreActivity(userId, input) };
        }
        case 'importToCheckin': {
          const input = ImportToCheckinInputSchema.parse(payload);
          return { code: 0, data: await deviceService.importToCheckin(userId, input) };
        }
        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );

  // V0.1.43 小米数据包上传（multipart ZIP + password，独立 route）
  // 阶段 2：解析 CSV + 入库 4 表（心率/血氧/睡眠/步数）
  app.post('/uploadXiaomiZip', async (req) => {
    if (!req.user) throw Errors.unauthorized();
    // multipart 接收 file + password（小米 ZIP 加密，密码用户上传时输入）
    const parts = req.parts({ limits: { fileSize: 50 * 1024 * 1024 } });
    let buffer: Buffer | null = null;
    let password = '';
    for await (const part of parts) {
      if (part.type === 'file') {
        buffer = await part.toBuffer();
      } else if (part.fieldname === 'password') {
        password = String(part.value);
      }
    }
    if (!buffer) throw Errors.badRequest('no file');
    const result = await deviceService.importXiaomiZip(req.user.id, buffer, password);
    return { code: 0, data: result };
  });
}
