/** distribution module routes — POST /api/distribution（V0.1.24 + V0.1.105 提现） */
import type { FastifyInstance } from 'fastify';
import { distributionService } from './distribution.service.js';
import { Errors } from '../../common/errors.js';
import { parseOrBadRequest } from '../../common/helpers/parse.js';
import { PageInputSchema, TeamInputSchema, WithdrawalRequestInputSchema } from './distribution.schema.js';

export async function distributionRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'mySummary':
        return { code: 0, data: await distributionService.mySummary(userId) };
      case 'myOrders':
        return {
          code: 0,
          data: await distributionService.myOrders(userId, parseOrBadRequest(PageInputSchema, payload ?? {})),
        };
      case 'myTeam':
        return {
          code: 0,
          data: await distributionService.myTeam(userId, parseOrBadRequest(TeamInputSchema, payload ?? {})),
        };
      case 'myCommissionLogs':
        return {
          code: 0,
          data: await distributionService.myCommissionLogs(
            userId,
            parseOrBadRequest(PageInputSchema, payload ?? {}),
          ),
        };
      case 'myLevel':
        return { code: 0, data: await distributionService.myLevel(userId) };
      case 'inviteInfo':
        return { code: 0, data: await distributionService.inviteInfo(userId) };
      // ===== V0.1.105 GAP-6 提现 =====
      case 'withdrawRequest':
        return {
          code: 0,
          data: await distributionService.requestWithdrawal(
            userId,
            parseOrBadRequest(WithdrawalRequestInputSchema, payload),
          ),
        };
      case 'myWithdrawals':
        return {
          code: 0,
          data: await distributionService.myWithdrawals(userId, parseOrBadRequest(PageInputSchema, payload ?? {})),
        };
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
