/**
 * goal module routes — POST /api/goal（V0.1.28 跑者向 + V0.1.34 家庭目标 + V0.1.135 自定义里程碑）
 *
 * 跑步目标：list（含进度）/ add / remove / myProgress / addFamilyGoal / myFamilyGoals
 * 自定义里程碑：addCustomMilestone / removeCustomMilestone / listCustomMilestones / checkMilestoneAchievement
 */
import type { FastifyInstance } from 'fastify';
import { goalService } from './goal.service.js';
import { Errors } from '../../common/errors.js';
import {
  AddGoalInputSchema,
  AddFamilyGoalSchema,
  GoalIdInputSchema,
  AddCustomMilestoneInputSchema,
  RemoveCustomMilestoneInputSchema,
  CheckMilestoneAchievementInputSchema,
} from './goal.schema.js';

export async function goalRoutes(app: FastifyInstance) {
  app.post('/', async (req, reply) => {
    if (!req.user) throw Errors.unauthorized();
    const userId = req.user.id;
    const { action, payload } = req.body as { action: string; payload?: unknown };

    switch (action) {
      case 'list':
        return { code: 0, data: await goalService.list(userId) };
      case 'add': {
        const input = AddGoalInputSchema.parse(payload);
        return { code: 0, data: await goalService.add(userId, input) };
      }
      case 'remove': {
        const { id } = GoalIdInputSchema.parse(payload);
        return { code: 0, data: await goalService.remove(userId, id) };
      }
      case 'myProgress':
        return { code: 0, data: await goalService.myProgress(userId) };
      case 'addFamilyGoal': {
        const input = AddFamilyGoalSchema.parse(payload);
        return { code: 0, data: await goalService.addFamilyGoal(userId, input) };
      }
      case 'myFamilyGoals':
        return { code: 0, data: await goalService.myFamilyGoals(userId) };
      // V0.1.135 自定义里程碑
      case 'addCustomMilestone': {
        const input = AddCustomMilestoneInputSchema.parse(payload);
        return { code: 0, data: await goalService.addCustomMilestone(userId, input) };
      }
      case 'removeCustomMilestone': {
        const input = RemoveCustomMilestoneInputSchema.parse(payload);
        return { code: 0, data: await goalService.removeCustomMilestone(userId, input) };
      }
      case 'listCustomMilestones':
        return { code: 0, data: await goalService.listCustomMilestones(userId) };
      case 'checkMilestoneAchievement': {
        const input = CheckMilestoneAchievementInputSchema.parse(payload);
        return { code: 0, data: await goalService.checkMilestoneAchievement(userId, input.km) };
      }
      default:
        return reply.status(400).send({ code: 400, msg: `unknown action: ${action}` });
    }
  });
}
