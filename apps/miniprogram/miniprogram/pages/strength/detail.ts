// pages/strength/detail.ts — 力量训练详情（V0.2.120：按动作分组的组明细 + V0.2.126 PB + 容量分布 + V0.2.144 报告 + V0.2.145 Canvas 海报 + V0.2.146 onShareAppMessage）
import { api } from '../../services/api';
import { drawTrainingReportPoster } from '../../utils/poster';

// V0.2.146 缓存最近一次海报临时文件路径（onShareAppMessage 读取）
let lastPosterTempPath = '';

interface SetItem {
  order: number;
  exerciseName: string;
  reps: number;
  weight: number;
  setIndex: number;
}

interface GroupedSet {
  exerciseName: string;
  sets: SetItem[];
}

interface PbItem {
  exerciseName: string;
  maxWeight: number;
  maxReps: number;
  achievedAt: string;
  setCount: number;
}

interface DistItem {
  exerciseName: string;
  totalVolume: number;
  setCount: number;
  percent: number;
  totalVolumeText: string;
}

function formatDuration(sec: number): string {
  if (!sec || sec <= 0) return '0 分钟';
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  return `${h}小时${m % 60}分`;
}

function formatVolume(v: number): string {
  if (!v || v <= 0) return '0';
  if (v >= 10000) return `${(v / 1000).toFixed(1)}k`;
  return `${Math.round(v)}`;
}

Page({
  data: {
    sessionId: '',
    session: null as {
      id: string;
      dateStr: string;
      durationSec: number;
      totalVolume: number;
      notes: string | null;
      durationText: string;
      totalVolumeText: string;
    } | null,
    sets: [] as SetItem[],
    groupedSets: [] as GroupedSet[],
    // V0.2.126 个人最佳 + 容量分布
    pbs: [] as PbItem[],
    distribution: [] as DistItem[],
    // V0.2.144 训练报告 modal
    reportVisible: false,
    report: { loading: false, data: null as null | object },
    // V0.2.149 完成度评分（多因子加权）
    completion: null as null | { score: number; factors: { rpeCoverage: number; postHrCoverage: number; noteCoverage: number; exerciseDiversity: number }; bonus: number; avgRpe: number; totalSets: number },
    loading: false,
  },

  onLoad(query: Record<string, string | undefined>) {
    const sid = query.sessionId || '';
    if (!sid) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      return;
    }
    this.setData({ sessionId: sid });
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true });
    try {
      // 并行拉详情 + 动作统计（PB + 容量分布）
      const [detail, stats] = await Promise.all([
        api.call<{
          session: { id: string; dateStr: string; durationSec: number; totalVolume: number; notes: string | null };
          sets: SetItem[];
        }>('strength', 'sessionDetail', { sessionId: this.data.sessionId }),
        api.call<{
          pbs: PbItem[];
          distribution: Array<{ exerciseName: string; totalVolume: number; setCount: number; percent: number }>;
        }>('strength', 'getExerciseStats', {}),
      ]);
      const sets = (detail.sets ?? []).sort((a, b) => a.order - b.order);
      // 按动作名分组
      const map = new Map<string, SetItem[]>();
      for (const s of sets) {
        if (!map.has(s.exerciseName)) map.set(s.exerciseName, []);
        map.get(s.exerciseName)!.push(s);
      }
      const groupedSets: GroupedSet[] = Array.from(map.entries()).map(([name, list]) => ({
        exerciseName: name,
        sets: list,
      }));
      this.setData({
        session: {
          id: detail.session.id,
          dateStr: detail.session.dateStr,
          durationSec: detail.session.durationSec,
          totalVolume: detail.session.totalVolume,
          notes: detail.session.notes,
          durationText: formatDuration(detail.session.durationSec),
          totalVolumeText: formatVolume(detail.session.totalVolume),
        },
        sets,
        groupedSets,
        pbs: stats.pbs ?? [],
        distribution: (stats.distribution ?? []).map((d) => ({
          ...d,
          totalVolumeText: formatVolume(d.totalVolume),
        })),
      });
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },

  /** V0.2.135 点动作名 → 拉趋势 + 打开 modal */
  async onTapExerciseTrend(e: WechatMiniprogram.TouchEvent) {
    const name = e.currentTarget.dataset.name as string;
    if (!name) return;
    this.setData({ trendVisible: true, 'trend.exerciseName': name, 'trend.loading': true, 'trend.points': [] });
    try {
      const res = await api.call<{ points: Array<{ dateStr: string; maxWeight: number; totalVolume: number; setCount: number }>; totalSessions: number; maxWeightAllTime: number }>(
        'strength', 'getExerciseTrend', { exerciseName: name, days: 90 },
      );
      const svg = buildTrendSvg(res.points ?? []);
      this.setData({ 'trend.loading': false, 'trend.points': res.points ?? [], 'trend.totalSessions': res.totalSessions ?? 0, 'trend.maxWeightAllTime': res.maxWeightAllTime ?? 0, 'trend.svg': svg });
    } catch (err) {
      this.setData({ 'trend.loading': false });
      wx.showToast({ title: (err as Error).message || '加载失败', icon: 'none' });
    }
  },

  onCloseTrendModal() {
    this.setData({ trendVisible: false });
  },

  /** V0.2.144 训练报告（拉 metrics + 显示 modal） + V0.2.149 完成度评分 */
  async onOpenReport() {
    this.setData({ reportVisible: true, 'report.loading': true, 'report.data': null, 'completion': null });
    try {
      // V0.2.149 并行拉 训练报告 + 完成度评分（前端不阻塞）
      const [data, completion] = await Promise.all([
        api.call<{
          totalSets: number; totalReps: number; totalVolume: number; avgRpe: number | null;
          rpeCompletion: number; exercises: Array<{ exerciseName: string; sets: number; reps: number; volume: number; maxWeight: number; avgRpe: number | null }>;
          rpeDist: number[]; durationText: string; dateStr: string; notes: string | null;
        }>('strength', 'getSessionReport', { sessionId: this.data.sessionId }),
        api.call<{ score: number; factors: { rpeCoverage: number; postHrCoverage: number; noteCoverage: number; exerciseDiversity: number }; bonus: number; avgRpe: number; totalSets: number }>('strength', 'getCompletionScore', { sessionId: this.data.sessionId }).catch(() => null),
      ]);
      this.setData({ 'report.loading': false, 'report.data': data, completion });
    } catch (e) {
      this.setData({ 'report.loading': false });
      wx.showToast({ title: (e as Error).message || '加载失败', icon: 'none' });
    }
  },

  onCloseReport() {
    this.setData({ reportVisible: false });
  },

  /** V0.2.144 分享训练报告（V0.2.144 收尾 UX：先简单复制摘要到剪贴板） */
  onShareReport() {
    const r = (this.data as { report?: { data?: unknown } }).report?.data as { exercises?: Array<{ exerciseName: string; sets: number; maxWeight: number; reps: number }>; totalVolume?: number; dateStr?: string } | undefined;
    if (!r || !r.exercises) return;
    const lines = [
      `🏋️ 训练报告 ${r.dateStr}`,
      `总容量 ${r.totalVolume} kg·次`,
      ...r.exercises.slice(0, 3).map((e) => `${e.exerciseName} ${e.sets}组 max${e.maxWeight}kg×${e.reps}次`),
    ];
    wx.setClipboardData({ data: lines.join('\n') });
    wx.showToast({ title: '已复制到剪贴板', icon: 'success' });
  },

  /** V0.2.145 生成训练报告 Canvas 海报 + 保存到相册 */
  onSavePoster() {
    const data = (this.data as { report?: { data?: object } }).report?.data as Parameters<typeof drawTrainingReportPoster>[1] | null;
    if (!data) {
      wx.showToast({ title: '请先加载训练报告', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '生成海报中...', mask: true });
    const ctx = wx.createCanvasContext('training-poster');
    drawTrainingReportPoster(ctx, data);
    ctx.draw(false, () => {
      // 延迟确保 draw 完成
      setTimeout(() => {
        wx.canvasToTempFilePath({
          canvasId: 'training-poster',
          success: (res) => {
            wx.hideLoading();
            // V0.2.146 缓存临时文件路径给 onShareAppMessage 读取
            lastPosterTempPath = res.tempFilePath;
            // 提示用户保存到相册
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: () => wx.showToast({ title: '已保存到相册，可分享', icon: 'success' }),
              fail: (err) => {
                // 用户可能拒绝授权；降级到复制
                if (err.errMsg?.includes('auth deny')) {
                  wx.setClipboardData({ data: res.tempFilePath });
                  wx.showModal({ title: '已复制图片路径', content: '请长按复制的内容手动保存' });
                } else {
                  wx.showToast({ title: '保存失败', icon: 'none' });
                }
              },
            });
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '生成失败', icon: 'none' });
          },
        });
      }, 200);
    });
  },
});

/** V0.2.146 onShareAppMessage 返 海报图 + 文案
 *
 * 微信分享：imageUrl 用 lastPosterTempPath（V0.2.145 保存的临时文件）
 * 无海报时（如刚加载详情未生成）则仅返文字分享，图片不传（兜底）
 */
export function onShareAppMessage() {
  type ReportData = { totalVolume?: number; totalSets?: number; dateStr?: string };
  const page = getCurrentPages().find((p) => {
    const route = (p as { route?: string }).route ?? '';
    return route.includes('detail');
  }) as { data?: { report?: { data?: ReportData } } } | undefined;
  const r = page?.data?.report?.data;
  const title = r
    ? `🏋️ 训练报告 ${r.dateStr ?? ''} · ${r.totalSets ?? 0} 组 ${r.totalVolume ?? 0} kg·次`
    : '💪 我的力量训练';
  return {
    title,
    path: '/pages/strength/detail?sessionId=current',
    imageUrl: lastPosterTempPath || undefined,
  };
}

/** V0.2.135 折线图 SVG 计算（不依赖外部库） */
function buildTrendSvg(points: Array<{ dateStr: string; maxWeight: number }>) {
  const w = 600;
  const h = 240;
  const padL = 40;
  const padR = 20;
  const padT = 20;
  const padB = 30;
  if (points.length === 0) return { w, h, points: '', dots: [], minW: 0, maxW: 0, firstDate: '', lastDate: '' };
  const weights = points.map((p) => p.maxWeight);
  const minW = Math.min(...weights);
  const maxW = Math.max(...weights);
  const xStep = (w - padL - padR) / Math.max(1, points.length - 1);
  const yRange = Math.max(1, maxW - minW);
  const xy: Array<{ x: number; y: number }> = points.map((p, i) => {
    const x = padL + i * xStep;
    const y = padT + (1 - (p.maxWeight - minW) / yRange) * (h - padT - padB);
    return { x: Math.round(x), y: Math.round(y) };
  });
  return {
    w,
    h,
    points: xy.map((p) => `${p.x},${p.y}`).join(' '),
    dots: xy,
    minW,
    maxW,
    firstDate: points[0].dateStr.slice(5),
    lastDate: points[points.length - 1].dateStr.slice(5),
  };
}
