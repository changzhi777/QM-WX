/**
 * upload-record.service — UploadRecord 持久化 + 入队（V0.1.150）
 *
 * 数据包上传 COS 后建 record + 入 upload-parse 队列异步解析。
 * 有 parser 的 type（xiaomi_zip/coros_fit）status=pending 入队；
 * 无 parser 的（图片等）status=parsed 不入队（仅留底审计）。
 */
import { prisma } from '../../infra/prisma.js';
import { enqueueUploadParse } from '../../jobs/queue.js';
import { getParser } from '../device/device-parser.registry.js';

export interface CreateUploadInput {
  type: string;
  cosUrl: string;
  objectKey: string;
  mime: string;
  size: number;
  password?: string;
}

export async function createUploadRecord(userId: string, input: CreateUploadInput) {
  const hasParser = getParser(input.type) !== undefined;
  const record = await prisma.uploadRecord.create({
    data: {
      userId,
      type: input.type,
      cosUrl: input.cosUrl,
      objectKey: input.objectKey,
      mime: input.mime,
      size: input.size,
      password: input.password,
      status: hasParser ? 'pending' : 'parsed',
    },
  });
  if (hasParser) {
    await enqueueUploadParse(record.id);
  }
  return record;
}

export async function myUploads(userId: string, page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    prisma.uploadRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.uploadRecord.count({ where: { userId } }),
  ]);
  return { items, total, page, pageSize };
}

export async function getUpload(id: string, userId?: string) {
  const record = await prisma.uploadRecord.findUnique({ where: { id } });
  if (!record) return null;
  if (userId && record.userId !== userId) return null; // 鉴权：仅本人/admin
  return record;
}
