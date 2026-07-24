// pages/insight/index.ts — V0.2.0 AI 洞察（用户画像 + 天气×运动关联散点图 + 千人千面策略）
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';

interface Profile {
  tags: string[];
  summary: string;
  basic: { gender?: string; age?: number; height?: number; weight?: number; bmi?: number; region?: string };
  sport: { totalDistance: number; checkinCount: number; avgHeartRate?: number | null };
  body?: { bodyFat?: number; muscle?: number; visceralFat?: number } | null;
}
interface Analysis {
  sufficient: boolean;
  count: number;
  message?: string;
  insights: string[];
  correlations: { tempPace: number | null; humidityHr: number | null; aqiHr: number | null };
  scatter: { tempPace: Array<{ x: number; y: number }>; humidityHr: Array<{ x: number; y: number }>; aqiHr: Array<{ x: number; y: number }> };
  feelsLikeZones?: Array<{ zone: string; label: string; avgPaceSec: number | null; count: number; avgPace?: string | null }>;
  optimalZone?: string | null;
}

/** 小程序 Canvas 2d node（typing 弱，用 any 避 CanvasRenderingContext2D 缺失坑）*/

/** V0.2.26 秒 → mm:ss 配速（feelsLikeZones 展示用）*/
function formatPace(sec: number): string {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

Page({
  data: {
    profile: null as Profile | null,
    analysis: null as Analysis | null,
    strategy: '',
    loadingStrategy: false,
    loading: true,
    error: '',
  },

  onLoad() {
    this.loadAll();
  },

  async loadAll() {
    this.setData({ loading: true, error: '' });
    try {
      await ensureLogin();
      const [profile, analysis] = await Promise.all([
        api.call<Profile>('stats', 'userProfile').catch(() => null),
        api.call<Analysis>('stats', 'weatherAnalysis').catch(() => null),
      ]);
      // V0.2.26 A1: feelsLikeZones avgPaceSec → mm:ss（展示用）
      if (analysis?.feelsLikeZones) {
        analysis.feelsLikeZones = analysis.feelsLikeZones.map((z) => ({
          ...z,
          avgPace: z.avgPaceSec != null ? formatPace(z.avgPaceSec) : null,
        }));
      }
      this.setData({ profile, analysis });
      if (analysis?.sufficient && analysis.scatter.tempPace.length) {
        // 等 canvas 渲染完再画
        setTimeout(() => this.drawScatter(analysis.scatter.tempPace), 100);
      }
    } catch (e) {
      this.setData({ error: (e as Error).message });
    } finally {
      this.setData({ loading: false });
    }
  },

  /** 画散点图（温度 × 配速）*/
  drawScatter(points: Array<{ x: number; y: number }>) {
    const query = wx.createSelectorQuery();
    query
      .select('#scatter')
      .fields({ node: true, size: true })
      .exec((res) => {
        if (!res[0]) return;
        // 小程序 Canvas 2d node（typing 弱，用 any 避开 CanvasRenderingContext2D 缺失）
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const canvas = res[0].node as any;
        const ctx = canvas.getContext('2d');
        const dpr = wx.getSystemInfoSync().pixelRatio;
        const w = res[0].width;
        const h = res[0].height;
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.scale(dpr, dpr);

        const pad = 36;
        const plotW = w - pad * 2;
        const plotH = h - pad * 2;

        let xmin = Math.min(...points.map((p) => p.x));
        let xmax = Math.max(...points.map((p) => p.x));
        let ymin = Math.min(...points.map((p) => p.y));
        let ymax = Math.max(...points.map((p) => p.y));
        const xr = xmax - xmin || 1;
        const yr = ymax - ymin || 1;
        xmin -= xr * 0.1;
        xmax += xr * 0.1;
        ymin -= yr * 0.1;
        ymax += yr * 0.1;

        // 坐标轴
        ctx.strokeStyle = '#ccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(pad, pad);
        ctx.lineTo(pad, h - pad);
        ctx.lineTo(w - pad, h - pad);
        ctx.stroke();

        // 散点
        ctx.fillStyle = '#2d9d78';
        points.forEach((p) => {
          const px = pad + ((p.x - xmin) / (xmax - xmin)) * plotW;
          const py = h - pad - ((p.y - ymin) / (ymax - ymin)) * plotH;
          ctx.beginPath();
          ctx.arc(px, py, 3, 0, Math.PI * 2);
          ctx.fill();
        });

        // 轴标签
        ctx.fillStyle = '#999';
        ctx.font = '10px sans-serif';
        ctx.fillText('气温(°C)', w - pad - 44, h - pad + 16);
        ctx.fillText('配速(秒/km)', pad - 28, pad - 8);
      });
  },

  /** 千人千面：喂画像 + 关联分析给 健康教练拿个性化建议 */
  async onTapStrategy() {
    if (this.data.loadingStrategy) return;
    const { profile, analysis } = this.data;
    if (!profile) {
      wx.showToast({ title: '画像加载中', icon: 'none' });
      return;
    }
    this.setData({ loadingStrategy: true, strategy: '' });
    const insightsText = analysis?.sufficient ? analysis.insights.join('；') : '天气数据积累中';
    const prompt = `我是${profile.summary}。运动与天气关联：${insightsText}。请基于我的画像给出3条简洁的个性化运动建议（每条一行，直接给建议不要客套）。`;
    try {
      const res = await api.call<{ reply: string }>('aiCoach', 'chat', { message: prompt });
      this.setData({ strategy: res.reply });
    } catch (e) {
      wx.showToast({ title: (e as Error).message ?? '建议计划失败', icon: 'none' });
    } finally {
      this.setData({ loadingStrategy: false });
    }
  },

  onRetry() {
    this.loadAll();
  },
});
