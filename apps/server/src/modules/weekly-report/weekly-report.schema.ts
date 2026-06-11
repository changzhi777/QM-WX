/**
 * weekly-report Zod schemas
 */
import { z } from 'zod';

export const WeeklyReportActionBodySchema = z.object({
  action: z.enum(['currentWeek', 'myReport', 'trigger']),
  payload: z
    .object({
      groupId: z.string().optional(),
      period: z.string().regex(/^\d{4}-W\d{2}$/).optional(),
    })
    .optional(),
});
