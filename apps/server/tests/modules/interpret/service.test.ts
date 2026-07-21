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
  callGlmVision: vi.fn(),
  isGlmVisionConfigured: () => true,
}));
vi.mock('src/modules/sport/sport.service.js', () => ({ sportService: { checkin: vi.fn() } }));
vi.mock('src/modules/ai-coach/context-builder.js', () => ({ buildUserContext: vi.fn() }));
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
import { callMinimax, callGlmVision } from 'src/modules/interpret/client.js';
import { sportService } from 'src/modules/sport/sport.service.js';
import { buildUserContext } from 'src/modules/ai-coach/context-builder.js';
import { interpretGarminFit, interpretScreenshot } from 'src/modules/interpret/service.js';

const mockedPrisma = vi.mocked(prisma);
const mockedCallMinimax = vi.mocked(callMinimax);
const mockedCallGlmVision = vi.mocked(callGlmVision);
const mockedCheckin = vi.mocked(sportService.checkin);
const mockedBuildUserContext = vi.mocked(buildUserContext);

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

// ===== V0.2.57 interpretScreenshot（识图 → checkin → 联动 → AI 分析 → 落表）=====

describe('interpretScreenshot (V0.2.57 截图闭环)', () => {
  const shotExtract = {
    type: 'run',
    distanceKm: 5,
    durationSec: 1800,
    heartRate: 150,
    paceSecPerKm: 360,
    calorie: 300,
    metrics: [{ name: '步频', value: '180' }],
    summary: '5km 晨跑',
  };

  it('happy: 识图 run + checkin + 联动画像 + 综合分析 + 落表（token 累加）', async () => {
    mockedCallGlmVision
      .mockResolvedValueOnce({ content: JSON.stringify(shotExtract), inputTokens: 10, outputTokens: 20, model: 'glm-4.6v' })
      .mockResolvedValueOnce({ content: '综合分析建议', inputTokens: 30, outputTokens: 40, model: 'glm-4.6v' });
    mockedCheckin.mockResolvedValue({});
    mockedBuildUserContext.mockResolvedValue('- 本年跑量：100km');
    (mockedPrisma.interpretRecord.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'rec-shot' });

    const r = await interpretScreenshot('u1', { imageUrl: 'https://cdn/x.jpg', inputKey: 'interpret/shot/x.jpg' });

    expect(r.interpretation).toBe('综合分析建议');
    expect(r.recordId).toBe('rec-shot');
    expect(r.checkinCreated).toBe(true);
    // 运动数据入 checkin（dataSource='sport_screenshot' 与 device pipeline 一致）
    expect(mockedCheckin).toHaveBeenCalledWith('u1', expect.objectContaining({ distance: 5, dataSource: 'sport_screenshot', sportType: 'run' }));
    // 联动画像被调用
    expect(mockedBuildUserContext).toHaveBeenCalledWith('u1');
    // 落表 type=screenshot + 两次 GLM token 累加（10+30 / 20+40）
    const createArg = (mockedPrisma.interpretRecord.create as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArg.data.type).toBe('screenshot');
    expect(createArg.data.inputKey).toBe('interpret/shot/x.jpg');
    expect(createArg.data.result).toBe('综合分析建议');
    expect(createArg.data.inputTokens).toBe(40);
    expect(createArg.data.outputTokens).toBe(60);
  });

  it('type=other（非运动）→ 不 checkin，仍落表 + 返解读', async () => {
    mockedCallGlmVision
      .mockResolvedValueOnce({ content: JSON.stringify({ type: 'other', distanceKm: null, durationSec: null, heartRate: null, paceSecPerKm: null, calorie: null, metrics: [], summary: '风景照' }), inputTokens: 5, outputTokens: 5, model: 'glm-4.6v' })
      .mockResolvedValueOnce({ content: '这是风景照解读', inputTokens: 5, outputTokens: 5, model: 'glm-4.6v' });
    mockedBuildUserContext.mockResolvedValue('画像');
    (mockedPrisma.interpretRecord.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'rec2' });

    const r = await interpretScreenshot('u1', { imageUrl: 'u', inputKey: 'k' });
    expect(r.checkinCreated).toBe(false);
    expect(mockedCheckin).not.toHaveBeenCalled();
    expect(r.interpretation).toBe('这是风景照解读');
  });

  it('checkin 失败不阻塞（仍落表 + 返解读，checkinCreated=false）', async () => {
    mockedCallGlmVision
      .mockResolvedValueOnce({ content: JSON.stringify(shotExtract), inputTokens: 10, outputTokens: 20, model: 'glm-4.6v' })
      .mockResolvedValueOnce({ content: '分析', inputTokens: 10, outputTokens: 10, model: 'glm-4.6v' });
    mockedCheckin.mockRejectedValue(new Error('checkin 校验失败：重复打卡'));
    mockedBuildUserContext.mockResolvedValue('画像');
    (mockedPrisma.interpretRecord.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'rec3' });

    const r = await interpretScreenshot('u1', { imageUrl: 'u', inputKey: 'k' });
    expect(r.checkinCreated).toBe(false);
    expect(r.interpretation).toBe('分析');
    expect(mockedPrisma.interpretRecord.create).toHaveBeenCalled();
  });

  it('GLM 识图失败抛错传播（不落表）', async () => {
    mockedCallGlmVision.mockRejectedValue(new Error('GLM-4.6V API 500: down'));
    await expect(interpretScreenshot('u1', { imageUrl: 'u', inputKey: 'k' })).rejects.toThrow(/GLM-4.6V API 500/);
    expect(mockedPrisma.interpretRecord.create).not.toHaveBeenCalled();
    expect(mockedCheckin).not.toHaveBeenCalled();
  });
});
