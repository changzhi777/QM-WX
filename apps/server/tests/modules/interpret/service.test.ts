/**
 * interpret service 单测（V0.2.33 + V0.2.36 补 P0：records fallback / parseAsync throw）
 * mock prisma + client + fit-file-parser，验证 佳明 FIT 解读流程
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

let mockFitData: unknown = { sessions: [{ total_distance: 5000, total_elapsed_time: 1800, avg_heart_rate: 150 }] };
let mockFitThrow: Error | null = null;

vi.mock('src/infra/prisma.js', () => ({
  prisma: {
    interpretRecord: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    checkin: { findFirst: vi.fn() },
  },
}));
vi.mock('src/infra/redis.js', () => ({ redis: { set: vi.fn(), get: vi.fn(), del: vi.fn() } }));
vi.mock('src/modules/interpret/client.js', () => ({
  callMinimax: vi.fn(),
  isMinimaxConfigured: () => true,
  callGlmVision: vi.fn(),
  callGlm: vi.fn(),
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
import { redis } from 'src/infra/redis.js';
import { callMinimax, callGlmVision, callGlm } from 'src/modules/interpret/client.js';
import { sportService } from 'src/modules/sport/sport.service.js';
import { buildUserContext } from 'src/modules/ai-coach/context-builder.js';
import { interpretGarminFit, interpretScreenshot, confirmScreenshotCheckin, issueH5Token, verifyH5Token, myInterpretHistory } from 'src/modules/interpret/service.js';

const mockedPrisma = vi.mocked(prisma);
const mockedRedis = vi.mocked(redis);
const mockedCallMinimax = vi.mocked(callMinimax);
const mockedCallGlmVision = vi.mocked(callGlmVision);
const mockedCallGlm = vi.mocked(callGlm);
const mockedCheckin = vi.mocked(sportService.checkin);
const mockedBuildUserContext = vi.mocked(buildUserContext);
const mockedRecordCreate = mockedPrisma.interpretRecord.create as unknown as ReturnType<typeof vi.fn>;
const mockedRecordFindUnique = mockedPrisma.interpretRecord.findUnique as unknown as ReturnType<typeof vi.fn>;
const mockedRecordUpdate = mockedPrisma.interpretRecord.update as unknown as ReturnType<typeof vi.fn>;
const mockedCheckinFindFirst = mockedPrisma.checkin.findFirst as unknown as ReturnType<typeof vi.fn>;

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

// ===== V0.2.60 interpretScreenshot（识图+分析不 auto checkin）+ confirmScreenshotCheckin（确认打卡）=====

describe('interpretScreenshot (V0.2.60 识图+分析，返 extract 不 auto checkin)', () => {
  const shotExtract = {
    type: 'run',
    date: '2026-07-20',
    distanceKm: 5,
    durationSec: 1800,
    heartRate: 150,
    paceSecPerKm: 360,
    calorie: 300,
    metrics: [{ name: '步频', value: '180' }],
    summary: '5km 晨跑',
  };

  it('happy: 识图 callGlmVision + 分析 callGlm（不传图）+ 联动 + 落表 extract + 返 extract（不 checkin）', async () => {
    mockedCallGlmVision.mockResolvedValueOnce({ content: JSON.stringify(shotExtract), inputTokens: 10, outputTokens: 20, model: 'glm-4.6v' });
    mockedCallGlm.mockResolvedValue({ content: '综合分析', inputTokens: 30, outputTokens: 40, model: 'glm-4.7' });
    mockedBuildUserContext.mockResolvedValue('- 本年跑量：100km');
    mockedRecordCreate.mockResolvedValue({ id: 'rec-shot' });

    const r = await interpretScreenshot('u1', { imageUrl: 'https://cdn/x.jpg', inputKey: 'interpret/shot/x.jpg' });

    expect(r.interpretation).toBe('综合分析');
    expect(r.recordId).toBe('rec-shot');
    expect(r.extract.distanceKm).toBe(5);
    expect(mockedCallGlm).toHaveBeenCalled(); // 第二次 callGlm 文本（不传图）
    expect(mockedCheckin).not.toHaveBeenCalled(); // V0.2.60 不 auto checkin
    const createArg = mockedRecordCreate.mock.calls[0][0] as { data: Record<string, unknown> };
    expect(createArg.data.type).toBe('screenshot');
    expect(createArg.data.extract).toEqual(shotExtract); // extract 落表供确认查回
  });

  it('type=other → 返 extract.type=other，不 checkin', async () => {
    mockedCallGlmVision.mockResolvedValueOnce({
      content: JSON.stringify({ type: 'other', date: null, distanceKm: null, durationSec: null, heartRate: null, paceSecPerKm: null, calorie: null, metrics: [], summary: '风景照' }),
      inputTokens: 5, outputTokens: 5, model: 'glm-4.6v',
    });
    mockedCallGlm.mockResolvedValue({ content: '风景照解读', inputTokens: 5, outputTokens: 5, model: 'glm-4.7' });
    mockedBuildUserContext.mockResolvedValue('画像');
    mockedRecordCreate.mockResolvedValue({ id: 'rec2' });
    const r = await interpretScreenshot('u1', { imageUrl: 'u', inputKey: 'k' });
    expect(r.extract.type).toBe('other');
    expect(mockedCheckin).not.toHaveBeenCalled();
  });

  it('GLM 识图失败抛错传播（不落表）', async () => {
    mockedCallGlmVision.mockRejectedValue(new Error('GLM-4.6V API 500: down'));
    await expect(interpretScreenshot('u1', { imageUrl: 'u', inputKey: 'k' })).rejects.toThrow(/GLM-4.6V API 500/);
    expect(mockedRecordCreate).not.toHaveBeenCalled();
    expect(mockedCheckin).not.toHaveBeenCalled();
  });
});

describe('confirmScreenshotCheckin (V0.2.60 用户确认 + 去重 + 防重复)', () => {
  const shotExtract = { type: 'run', date: '2026-07-20', distanceKm: 5, durationSec: 1800, heartRate: 150, paceSecPerKm: 360, calorie: 300, metrics: [] as Array<{ name: string; value: string }>, summary: '5km' };

  it('happy: 查 extract + 无重复 → checkin + 标 checkinConfirmedAt', async () => {
    mockedRecordFindUnique.mockResolvedValue({ id: 'rec1', userId: 'u1', type: 'screenshot', extract: shotExtract, checkinConfirmedAt: null });
    mockedCheckinFindFirst.mockResolvedValue(null);
    mockedCheckin.mockResolvedValue({});
    mockedRecordUpdate.mockResolvedValue({});
    const r = await confirmScreenshotCheckin('u1', { recordId: 'rec1' });
    expect(r.checkinCreated).toBe(true);
    expect(mockedCheckin).toHaveBeenCalledWith('u1', expect.objectContaining({ distance: 5, date: '2026-07-20', dataSource: 'sport_screenshot', sportType: 'run' }));
    expect(mockedRecordUpdate).toHaveBeenCalledWith({ where: { id: 'rec1' }, data: { checkinConfirmedAt: expect.any(Date) } });
  });

  it('已确认过（checkinConfirmedAt 非空）→ checkinCreated false + reason', async () => {
    mockedRecordFindUnique.mockResolvedValue({ id: 'rec1', userId: 'u1', type: 'screenshot', extract: shotExtract, checkinConfirmedAt: new Date() });
    const r = await confirmScreenshotCheckin('u1', { recordId: 'rec1' });
    expect(r.checkinCreated).toBe(false);
    expect(r.reason).toMatch(/已确认/);
    expect(mockedCheckin).not.toHaveBeenCalled();
  });

  it('去重：同 userId+date+distance 已存在 → checkinCreated false', async () => {
    mockedRecordFindUnique.mockResolvedValue({ id: 'rec1', userId: 'u1', type: 'screenshot', extract: shotExtract, checkinConfirmedAt: null });
    mockedCheckinFindFirst.mockResolvedValue({ id: 'dup' });
    const r = await confirmScreenshotCheckin('u1', { recordId: 'rec1' });
    expect(r.checkinCreated).toBe(false);
    expect(r.reason).toMatch(/已存在/);
    expect(mockedCheckin).not.toHaveBeenCalled();
  });

  it('extract 无运动数据（type=other / distanceKm<=0）→ badRequest', async () => {
    mockedRecordFindUnique.mockResolvedValue({
      id: 'rec1', userId: 'u1', type: 'screenshot', checkinConfirmedAt: null,
      extract: { type: 'other', date: null, distanceKm: null, durationSec: null, heartRate: null, paceSecPerKm: null, calorie: null, metrics: [], summary: '风景' },
    });
    await expect(confirmScreenshotCheckin('u1', { recordId: 'rec1' })).rejects.toThrow(/未识别|不可打卡|无效/);
    expect(mockedCheckin).not.toHaveBeenCalled();
  });
});

// ===== V0.2.63 H5 fallback：token + 历史 =====

describe('H5 token + history (V0.2.63)', () => {
  it('issueH5Token: redis.set EX 300 + 返 token/url', async () => {
    const r = await issueH5Token('u1');
    expect(r.token).toBeTruthy();
    expect(r.url).toContain('/h5/interpret.html?token=');
    expect(mockedRedis.set).toHaveBeenCalledWith(`interpret:h5:${r.token}`, 'u1', 'EX', 300);
  });

  it('verifyH5Token: 有效返 userId / 空 token 抛 unauthorized', async () => {
    mockedRedis.get.mockResolvedValueOnce('u1');
    expect(await verifyH5Token('valid-token')).toBe('u1');
    mockedRedis.get.mockResolvedValueOnce(null);
    await expect(verifyH5Token('expired')).rejects.toThrow(/unauthorized|未授权|未登录/);
  });

  it('myInterpretHistory: findMany screenshot desc + count', async () => {
    mockedPrisma.interpretRecord.findMany.mockResolvedValueOnce([{ id: 'r1', result: '解读', extract: { type: 'run', distanceKm: 5 }, checkinConfirmedAt: null, createdAt: new Date() }]);
    mockedPrisma.interpretRecord.count.mockResolvedValueOnce(1);
    const r = await myInterpretHistory('u1', { page: 1, pageSize: 10 });
    expect(r.total).toBe(1);
    expect(r.list[0].id).toBe('r1');
    expect(mockedPrisma.interpretRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'u1', type: 'screenshot' }, orderBy: { createdAt: 'desc' } }));
  });
});
