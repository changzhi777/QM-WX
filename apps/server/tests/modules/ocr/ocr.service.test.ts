/**
 * ocr.service 单测 — V0.2.1（3 action：generalBasic/generalAccurate/idCard）
 *
 * mock ocr.client.getOcrClient（SDK 实例方法），验证：
 * - 文本行提取（TextDetections）/ idCard 字段 + null 兜底 / 未配置守卫 / 空 TextDetections
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getOcrClient: vi.fn(),
  isOcrConfigured: vi.fn(() => true),
}));

vi.mock('src/modules/ocr/ocr.client.js', () => ({
  getOcrClient: mocks.getOcrClient,
  isOcrConfigured: mocks.isOcrConfigured,
}));

const { ocrService } = await import('src/modules/ocr/ocr.service.js');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.isOcrConfigured.mockReturnValue(true);
});

describe('ocr.service.generalBasic', () => {
  it('TextDetections → 文本行数组', async () => {
    mocks.getOcrClient.mockReturnValue({
      GeneralBasicOCR: vi.fn().mockResolvedValue({
        TextDetections: [{ DetectedText: '10.5 km' }, { DetectedText: "5'30\"" }],
      }),
    });
    const lines = await ocrService.generalBasic(Buffer.from('img'));
    expect(lines).toEqual(['10.5 km', "5'30\""]);
  });

  it('TextDetections 缺失 → 空数组', async () => {
    mocks.getOcrClient.mockReturnValue({ GeneralBasicOCR: vi.fn().mockResolvedValue({}) });
    const lines = await ocrService.generalBasic(Buffer.from('img'));
    expect(lines).toEqual([]);
  });
});

describe('ocr.service.generalAccurate', () => {
  it('高精度文本行', async () => {
    mocks.getOcrClient.mockReturnValue({
      GeneralAccurateOCR: vi.fn().mockResolvedValue({ TextDetections: [{ DetectedText: '高精度识别' }] }),
    });
    const lines = await ocrService.generalAccurate(Buffer.from('img'));
    expect(lines).toEqual(['高精度识别']);
  });
});

describe('ocr.service.idCard', () => {
  it('全字段 → { name, idNo, sex, birth, address }', async () => {
    mocks.getOcrClient.mockReturnValue({
      IDCardOCR: vi.fn().mockResolvedValue({
        Name: '张三',
        IdNum: '110101199001011234',
        Sex: '男',
        Birth: '1990/1/1',
        Address: '北京市朝阳区',
      }),
    });
    const card = await ocrService.idCard(Buffer.from('img'));
    expect(card).toEqual({
      name: '张三',
      idNo: '110101199001011234',
      sex: '男',
      birth: '1990/1/1',
      address: '北京市朝阳区',
    });
  });

  it('字段缺失 → null 兜底', async () => {
    mocks.getOcrClient.mockReturnValue({ IDCardOCR: vi.fn().mockResolvedValue({ Name: '李四' }) });
    const card = await ocrService.idCard(Buffer.from('img'));
    expect(card.name).toBe('李四');
    expect(card.idNo).toBeNull();
    expect(card.address).toBeNull();
  });
});

describe('ocr.service 未配置守卫', () => {
  it('generalBasic 未配置 → badRequest(400)', async () => {
    mocks.isOcrConfigured.mockReturnValue(false);
    await expect(ocrService.generalBasic(Buffer.from('img'))).rejects.toMatchObject({ code: 400 });
  });

  it('idCard 未配置 → badRequest(400)', async () => {
    mocks.isOcrConfigured.mockReturnValue(false);
    await expect(ocrService.idCard(Buffer.from('img'))).rejects.toMatchObject({ code: 400 });
  });
});
