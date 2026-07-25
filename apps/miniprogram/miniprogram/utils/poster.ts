// utils/poster.ts — Canvas 海报工具（V0.2.145 训练报告分享）
//
// 微信小程序 Canvas 2D 海报生成（750×1334 标准朋友圈分享图）
// 范式：纯函数 — 输入数据 → 输出 wx.canvasToTempFilePath 临时文件路径
// 0 外部依赖（V0.2.135 SVG 趋势图同款）

export interface PosterExercise {
  exerciseName: string;
  sets: number;
  reps: number;
  maxWeight: number;
  volume: number;
  avgRpe: number | null;
}

export interface PosterReport {
  dateStr: string;
  durationText: string;
  totalSets: number;
  totalReps: number;
  totalVolume: number;
  avgRpe: number | null;
  rpeCompletion: number;
  exercises: PosterExercise[];
  notes: string | null;
}

const W = 750;
const H = 1334;
const BG = '#FFFFFF';
const BRAND = '#2D9D78';
const TEXT = '#333333';
const SUB = '#999999';
const BORDER = '#E0E0E0';

/** 训练报告海报：绘制到 canvas context；调用方需传入 canvas 2d context */
export function drawTrainingReportPoster(ctx: WechatMiniprogram.CanvasContext, report: PosterReport) {
  // 背景
  ctx.setFillStyle(BG);
  ctx.fillRect(0, 0, W, H);

  // 顶部品牌条
  ctx.setFillStyle(BRAND);
  ctx.fillRect(0, 0, W, 180);

  ctx.setFontSize(48);
  ctx.setFillStyle('#FFFFFF');
  ctx.setTextAlign('center');
  ctx.fillText('训练报告', W / 2, 90);
  ctx.setFontSize(26);
  ctx.fillText(report.dateStr, W / 2, 140);

  // 4 大指标卡
  const metricY = 230;
  const metrics: Array<{ label: string; value: string }> = [
    { label: '组数', value: String(report.totalSets) },
    { label: '次数', value: String(report.totalReps) },
    { label: 'kg·次', value: String(report.totalVolume) },
    { label: '平均 RPE', value: report.avgRpe ? String(report.avgRpe) : '—' },
  ];
  const cardW = (W - 80) / 4 - 12;
  metrics.forEach((m, i) => {
    const x = 40 + i * (cardW + 12);
    ctx.setFillStyle('#F0F9F4');
    roundRect(ctx, x, metricY, cardW, 140, 12);
    ctx.fill();
    ctx.setFontSize(40);
    ctx.setFillStyle(BRAND);
    ctx.setTextAlign('center');
    ctx.fillText(m.value, x + cardW / 2, metricY + 60);
    ctx.setFontSize(22);
    ctx.setFillStyle(SUB);
    ctx.fillText(m.label, x + cardW / 2, metricY + 105);
  });

  // RPE 填写率
  ctx.setFontSize(24);
  ctx.setFillStyle(TEXT);
  ctx.setTextAlign('left');
  ctx.fillText(`时长 ${report.durationText}  ·  RPE 填写率 ${report.rpeCompletion}%`, 40, 420);

  // 动作明细
  ctx.setFontSize(32);
  ctx.setFillStyle(BRAND);
  ctx.fillText('动作明细', 40, 490);

  const topExercises = report.exercises.slice(0, 6);
  const exY = 540;
  topExercises.forEach((ex, i) => {
    const y = exY + i * 90;
    ctx.setFillStyle('#FAFAFA');
    roundRect(ctx, 40, y, W - 80, 80, 8);
    ctx.fill();
    ctx.setFontSize(28);
    ctx.setFillStyle(TEXT);
    ctx.setTextAlign('left');
    ctx.fillText(ex.exerciseName, 60, y + 35);
    ctx.setFontSize(24);
    ctx.setFillStyle(SUB);
    ctx.fillText(`${ex.sets}组 · max${ex.maxWeight}kg×${ex.reps}`, 60, y + 65);
    ctx.setTextAlign('right');
    ctx.setFillStyle(BRAND);
    ctx.setFontSize(28);
    ctx.fillText(`${ex.volume}`, W - 60, y + 50);
    ctx.fillText('kg·次', W - 60, y + 70);
  });

  // 底部品牌
  const footerY = H - 100;
  ctx.setFillStyle(BORDER);
  ctx.fillRect(40, footerY, W - 80, 1);
  ctx.setFontSize(24);
  ctx.setFillStyle(SUB);
  ctx.setTextAlign('center');
  ctx.fillText('💪 沐禾健康 · 记录每一次进步', W / 2, footerY + 50);
}

function roundRect(ctx: WechatMiniprogram.CanvasContext, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
