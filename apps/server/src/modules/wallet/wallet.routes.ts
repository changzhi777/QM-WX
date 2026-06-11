/**
 * wallet routes — POST /api/wallet
 *
 * 全部 endpoint 受 requireFeature: 'wallet' 守卫
 * 当前 wallet=false → 全部 403
 */
import type { FastifyInstance } from 'fastify';
import { walletService } from './wallet.service.js';
import { Errors } from '../../common/errors.js';
import {
  GetWalletInputSchema,
  RechargeInputSchema,
  TransactionsInputSchema,
  WalletActionBodySchema,
} from './wallet.schema.js';

export async function walletRoutes(app: FastifyInstance) {
  app.post(
    '/',
    {
      schema: { body: WalletActionBodySchema },
      config: { requireFeature: 'wallet' },
    },
    async (req, reply) => {
      if (!req.user) throw Errors.unauthorized();
      const userId = req.user.id;
      const { action, payload } = req.body as { action: string; payload?: unknown };

      switch (action) {
        case 'get': {
          GetWalletInputSchema.parse(payload ?? {});
          return { code: 0, data: await walletService.get(userId) };
        }
        case 'transactions': {
          const input = TransactionsInputSchema.parse(payload ?? {});
          return { code: 0, data: await walletService.transactions(userId, input) };
        }
        case 'recharge': {
          const input = RechargeInputSchema.parse(payload);
          return { code: 0, data: await walletService.recharge(userId, input) };
        }
        default:
          return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
      }
    },
  );
}
