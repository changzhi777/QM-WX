/**
 * content module business logic
 *
 * 关键原则（02 §5.4 + 04 §T3-6）：
 * - 5 类内容（marathon/hotel/scenic/food/rural）走同一套表 + action
 * - enroll **仅登记意向**，不收钱（支付未开通）
 * - 列表分页 + 按 type 过滤
 */
import { prisma } from '../../infra/prisma.js';
import { Errors } from '../../common/errors.js';
import type {
  ContentListInput,
  ContentEnrollInput,
} from './content.schema.js';

export const contentService = {
  async list(input: ContentListInput) {
    const where = {
      status: 'on',
      ...(input.type ? { type: input.type } : {}),
    };
    const [list, total] = await Promise.all([
      prisma.content.findMany({
        where,
        orderBy: [{ sort: 'desc' }, { createdAt: 'desc' }],
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
        select: {
          id: true,
          type: true,
          title: true,
          cover: true,
          summary: true,
          price: true,
          fee: true,
          date: true,
          location: true,
          tags: true,
          actionType: true,
        },
      }),
      prisma.content.count({ where }),
    ]);
    return { list, total, page: input.page, pageSize: input.pageSize };
  },

  async detail(id: string) {
    const content = await prisma.content.findUnique({ where: { id } });
    if (!content) throw Errors.notFound('内容不存在');
    if (content.status !== 'on') throw Errors.notFound('内容已下架');
    return { content };
  },

  /**
   * 报名/登记意向
   *
   * ⚠️ 当前阶段：仅写 enrollments 表，**不收钱**
   * 支付开关打开后，再在 admin 端做审核 → 收款
   */
  async enroll(userId: string, input: ContentEnrollInput) {
    const content = await prisma.content.findUnique({ where: { id: input.id } });
    if (!content) throw Errors.notFound('内容不存在');
    if (content.status !== 'on') throw Errors.forbidden('该内容已下架');
    if (content.actionType === 'none') {
      throw Errors.forbidden('该内容仅展示，不接受报名');
    }

    // 防重复：同 user + 同 content 已 submitted/confirmed 不再录
    const existing = await prisma.enrollment.findFirst({
      where: {
        userId,
        contentId: input.id,
        status: { in: ['submitted', 'confirmed'] },
      },
    });
    if (existing) throw Errors.conflict('你已提交过意向，请勿重复');

    const enrollment = await prisma.enrollment.create({
      data: {
        userId,
        contentId: input.id,
        type: content.type,
        formData: input.formData,
        status: 'submitted',
      },
    });

    return {
      enrollmentId: enrollment.id,
      message: '意向已提交，客服会尽快联系您',
    };
  },
};
