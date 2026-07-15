/**
 * device-parser.registry 单测（V0.1.151 + V0.2.2 huawei_export 集成）
 *
 * 覆盖各 type parser 分发：
 * - garmin_fit 复用 importCorosFit
 * - sport_screenshot OCR（mock generalOcr + parseSportScore）→ 自动 Checkin / 无距离不建
 * - apple_health（真 XMLParser + mock sportService.checkin）→ Workout 跑步建 Checkin
 * - huawei_export（V0.2.2 — 无效 buffer 抛错，集成见 huawei-export.parser.test.ts）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDeviceService = vi.hoisted(() => ({
  importCorosFit: vi.fn(),
  importXiaomiZip: vi.fn(),
}));
const mockSportService = vi.hoisted(() => ({ checkin: vi.fn() }));
const mockGeneralOcr = vi.hoisted(() => vi.fn());
const mockParseScore = vi.hoisted(() => vi.fn());

vi.mock('src/modules/device/device.service.js', () => ({ deviceService: mockDeviceService }));
vi.mock('src/modules/sport/sport.service.js', () => ({ sportService: mockSportService }));
vi.mock('src/infra/ocr.js', () => ({ parseSportScore: mockParseScore }));
vi.mock('src/modules/ocr/ocr.service.js', () => ({ ocrService: { generalBasic: mockGeneralOcr } }));

import { PARSERS } from 'src/modules/device/device-parser.registry.js';

beforeEach(() => vi.clearAllMocks());

describe('garmin_fit (V0.1.151)', () => {
  it('复用 importCorosFit', async () => {
    mockDeviceService.importCorosFit.mockResolvedValue({ id: 'r1' });
    const r = await PARSERS.garmin_fit('u1', Buffer.from('fit'));
    expect(mockDeviceService.importCorosFit).toHaveBeenCalledWith('u1', expect.any(Buffer));
    expect(r.summary).toContain('佳明');
  });
});

describe('sport_screenshot OCR (V0.1.151)', () => {
  it('OCR 提取距离 → 自动建 Checkin', async () => {
    mockGeneralOcr.mockResolvedValue(['10.5 km']);
    mockParseScore.mockReturnValue({ distanceKm: 10.5, durationSec: 3300, paceSecPerKm: 330 });
    mockSportService.checkin.mockResolvedValue({});
    const r = await PARSERS.sport_screenshot('u1', Buffer.from('img'));
    expect(mockGeneralOcr).toHaveBeenCalled();
    expect(mockSportService.checkin).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ distance: 10.5, dataSource: 'sport_screenshot' }),
    );
    expect(r.summary).toContain('已自动打卡');
  });

  it('无距离 → 不建 Checkin，存 OCR 文本', async () => {
    mockGeneralOcr.mockResolvedValue(['无距离文本']);
    mockParseScore.mockReturnValue({ distanceKm: null, durationSec: null, paceSecPerKm: null });
    const r = await PARSERS.sport_screenshot('u1', Buffer.from('img'));
    expect(mockSportService.checkin).not.toHaveBeenCalled();
    expect(r.summary).toContain('未打卡');
  });
});

describe('apple_health (V0.1.151)', () => {
  it('解析 Workout 跑步 → 建 Checkin', async () => {
    const xml = `<?xml version="1.0"?><HealthData><Workout workoutActivityType="HKWorkoutActivityTypeRunning" startDate="2026-07-15 08:00:00 +0800" duration="3600" totalDistance="10.5" totalDistanceUnit="km"/></HealthData>`;
    mockSportService.checkin.mockResolvedValue({});
    const r = await PARSERS.apple_health('u1', Buffer.from(xml));
    expect(mockSportService.checkin).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ distance: 10.5, dataSource: 'apple_health' }),
    );
    expect(r.summary).toContain('1 条跑步');
  });

  it('非跑步 Workout → 跳过不建', async () => {
    const xml = `<?xml version="1.0"?><HealthData><Workout workoutActivityType="HKWorkoutActivityTypeCycling" duration="3600" totalDistance="20" totalDistanceUnit="km"/></HealthData>`;
    const r = await PARSERS.apple_health('u1', Buffer.from(xml));
    expect(mockSportService.checkin).not.toHaveBeenCalled();
    expect(r.summary).toContain('0 条跑步');
  });
});

describe('huawei_export (V0.2.2)', () => {
  it('无效 buffer（非 ZIP）→ 抛错（fail-fast）', async () => {
    // V0.2.2 init #11 落地：unzipper.Open.buffer 解析失败 → 抛错
    // 详细单测见 huawei-export.parser.test.ts（20 用例）
    await expect(PARSERS.huawei_export('u1', Buffer.from('not-a-zip'))).rejects.toThrow();
    // sportService.checkin 不被调（fail-fast）
    expect(mockSportService.checkin).not.toHaveBeenCalled();
  });
});
