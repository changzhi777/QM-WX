/**
 * interpret service 单测（V0.2.33 + V0.2.36 补 P0：records fallback / parseAsync throw）
 * mock prisma + client + fit-file-parser，验证 佳明 FIT 解读流程
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockFitData: unknown = { sessions: [{ total_distance: 5000, total_elapsed_time: 1800, avg_heart_rate: 150 }] };
let mockFitThrow: Error | null = null;

vi.mock('src/infra/prisma.js', () => ({
  prisma: { interpretRecord: { create: vi.fn() } },
}));
vi.mock('src/modules/interpret/client.js', () => ({
  callMinimax: vi.fn(),
  isMinimaxConfigured: () => true,
}));
vi.mock('fit-file-parser', () => ({
  default: class MockFitParser {
    constructor() {}
    async parseAsync() {
      if (mockFitThrow) throw mockFitThrow;
      return mockFitData;
    }
  },
}));

import { prisma } from 'src/infra/prisma.js';
import { callMinimax } from 'src/modules/interpret/client.js';
import { interpretGarminFit } from 'src/modules/interpret/service.js';

const mockedPrisma = vi.mocked(prisma);
const mockedCallMinimax = vi.mocked(callMinimax);

beforeEach(() => {
  vi.clearAllMocks();
  mockFitData = { sessions: [{ total_distance: 5000, total_elapsed_time: 1800, avg_heart_rate: 150 }] };
  mockFitThrow = null;
});

describe('interpret service (V0.2.33 佳明 FIT 解读)', () => {
  it('happy: FIT 解析 → minimax 解读 → 落 InterpretRecord → 返 interpretation+recordId', async () => {
    mockedCallMinimax.mockResolvedValue({ content: '佳明解读文本', inputTokens: 50, outputTokens: 100, model: 'MiniMax-M3' });
    (mockedPrisma.interpretRecord.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'rec1' });

    const r = await interpretGarminFit('u1', { buffer: Buffer.from('fake-fit'), inputKey: 'cos/u1/xx.fit' });

    expect(r.interpretation).toBe('佳明解读文本');
    expect(r.recordId).toBe('rec1');
    expect(mockedCallMinimax).toHaveBeenCalled();
    const createArg = (mockedPrisma.interpretRecord.create as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data.userId).toBe('u1');
    expect(createArg.data.type).toBe('garmin_fit');
    expect(createArg.data.inputKey).toBe('cos/u1/xx.fit');
    expect(createArg.data.result).toBe('佳明解读文本');
    expect(createArg.data.model).toBe('MiniMax-M3');
  });

  it('FIT 无有效数据抛错（sessions + records 都空）', async () => {
    mockFitData = { sessions: [], records: [] };
    await expect(interpretGarminFit('u1', { buffer: Buffer.from('x'), inputKey: 'k' })).rejects.toThrow(
      /无有效运动数据/,
    );
    expect(mockedCallMinimax).not.toHaveBeenCalled();
  });

  it('minimax 调用失败抛错传播', async () => {
    mockedCallMinimax.mockRejectedValue(new Error('MiniMax API 500: down'));
    await expect(interpretGarminFit('u1', { buffer: Buffer.from('x'), inputKey: 'k' })).rejects.toThrow(/MiniMax API 500/);
    expect(mockedPrisma.interpretRecord.create).not.toHaveBeenCalled();
  });

  it('P0: records fallback（sessions 空 → records 聚合，不抛「无有效数据」）', async () => {
    // 某些 FIT 只有 records 无 sessions，service 应走 records 聚合
    mockFitData = { sessions: [], records: [{ distance: 3000, elapsed_time: 1200, avg_heart_rate: 140 }] };
    mockedCallMinimax.mockResolvedValue({ content: 'records 解读', inputTokens: 10, outputTokens: 20, model: 'MiniMax-M3' });
    (mockedPrisma.interpretRecord.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'rec2' });

    const r = await interpretGarminFit('u1', { buffer: Buffer.from('fit-only-records'), inputKey: 'k' });
    expect(r.interpretation).toBe('records 解读');
    expect(mockedCallMinimax).toHaveBeenCalled();
  });

  it('P0: parseAsync throw（损坏 FIT）→ 抛 FIT 解析失败', async () => {
    mockFitThrow = new Error('invalid fit header');
    await expect(interpretGarminFit('u1', { buffer: Buffer.from('bad'), inputKey: 'k' })).rejects.toThrow(
      /FIT 解析失败/,
    );
    expect(mockedCallMinimax).not.toHaveBeenCalled();
    expect(mockedPrisma.interpretRecord.create).not.toHaveBeenCalled();
  });
});
