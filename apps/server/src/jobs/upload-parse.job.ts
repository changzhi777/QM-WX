/**
 * upload-parse.job — COS 上传异步解析 worker（V0.1.150）
 *
 * 流程：读 UploadRecord → infra/cos.getObject 拉 buffer → registry[type] 解析 → 更新 status
 * 状态机：pending → parsing → parsed | failed
 * 幂等：status=parsed 直接返回；失败抛错触发 BullMQ 重试（attempts=2）
 */
import { prisma } from '../infra/prisma.js';
import { getObject } from '../infra/cos.js';
import { getParser } from '../modules/device/device-parser.registry.js';
import { logger } from '../common/logger.js';

export interface UploadParseJobData {
  recordId: string;
}

export async function processUploadParse(data: UploadParseJobData): Promise<{ ok: boolean }> {
  const record = await prisma.uploadRecord.findUnique({ where: { id: data.recordId } });
  if (!record) throw new Error(`UploadRecord ${data.recordId} not found`);
  if (record.status === 'parsed') return { ok: true }; // 幂等

  const parser = getParser(record.type);
  if (!parser) {
    await prisma.uploadRecord.update({
      where: { id: record.id },
      data: { status: 'failed', errorMsg: `no parser for type ${record.type}` },
    });
    return { ok: false };
  }

  await prisma.uploadRecord.update({ where: { id: record.id }, data: { status: 'parsing' } });

  try {
    const buffer = await getObject(record.objectKey);
    // parser 超时保护（30s，防 invalid 输入如 fake FIT 卡住 fit-file-parser 不返回）
    const result = await Promise.race([
      parser(record.userId, buffer, record.password ?? undefined),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('parser 超时(30s)')), 30_000),
      ),
    ]);
    await prisma.uploadRecord.update({
      where: { id: record.id },
      data: { status: 'parsed', parsedResult: result as never, errorMsg: null },
    });
    logger.info({ recordId: record.id, type: record.type }, 'upload parsed');
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    await prisma.uploadRecord.update({
      where: { id: record.id },
      data: { status: 'failed', errorMsg: msg },
    });
    logger.error({ recordId: record.id, err: msg }, 'upload parse failed');
    throw e; // 触发 BullMQ 重试
  }
}
