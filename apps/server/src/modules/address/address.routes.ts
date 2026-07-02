/** address module routes — POST /api/address（V0.1.23） */
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addressService } from './address.service.js';
import { Errors } from '../../common/errors.js';
import { AddressInputSchema, AddressUpdateSchema } from './address.schema.js';

function parseOrBadRequest<S extends z.ZodTypeAny>(schema: S, payload: unknown): z.output<S> {
  try {
    return schema.parse(payload) as z.output<S>;
  } catch (e) {
    if (e instanceof z.ZodError) {
      throw Errors.badRequest(`${e.issues[0].path.join('.')}: ${e.issues[0].message}`);
    }
    throw e;
  }
}

export async function addressRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'list':
        return { code: 0, data: { list: await addressService.list(userId) } };
      case 'create':
        return { code: 0, data: await addressService.create(userId, parseOrBadRequest(AddressInputSchema, payload)) };
      case 'update': {
        const { id, ...input } = parseOrBadRequest(AddressUpdateSchema, payload);
        return { code: 0, data: await addressService.update(userId, id, input) };
      }
      case 'remove':
        return { code: 0, data: await addressService.remove(userId, parseOrBadRequest(AddressInputSchema.extend({ id: z.string() }), payload).id) };
      case 'setDefault': {
        const id = parseOrBadRequest(z.object({ id: z.string().min(1) }), payload).id;
        return { code: 0, data: await addressService.setDefault(userId, id) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
