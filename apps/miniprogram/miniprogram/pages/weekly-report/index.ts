// pages/weekly-report/index.ts
import { api } from '../../services/api';
import type { WeeklyReport } from '@qm-wx/shared';

const CANVAS_WIDTH = 750;
const CANVAS_HEIGHT = 1200;

Page({
  data: {
    reports: [] as WeeklyReport[],
    current: null as WeeklyReport | null,
    loading: true,
    canvasReady: false,
  },

  onShow() {
    this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const { reports } = await api.call<{ reports: WeeklyReport[] }>('weekly-report', 'currentWeek');
      this.setData({ reports, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  async onSelectReport(e: WechatMiniprogram.CustomEvent) {
    const id = e.currentTarget.dataset.id as string;
    const report = this.data.reports.find((r) => r.groupId === id);
    if (!report) return;
    this.setData({ current: report, canvasReady: false });
    // 等一帧让 canvas 显示
    setTimeout(() => this.setData({ canvasReady: true }, () => this.drawPoster(report)), 100);
  },

  onClosePoster() {
    this.setData({ current: null, canvasReady: false });
  },

  /**
   * 战报图：用 Canvas 2D 绘制
   */
  drawPoster(report: WeeklyReport) {
    const query = wx.createSelectorQuery();
    query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
      const canvas = res[0]?.node as WechatMiniprogram.Canvas | undefined;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio;
      canvas.width = CANVAS_WIDTH * dpr;
      canvas.height = CANVAS_HEIGHT * dpr;
      ctx.scale(dpr, dpr);

      // ===== 背景 =====
      const grad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      grad.addColorStop(0, '#0FAF8E');
      grad.addColorStop(1, '#4FC3A1');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // ===== 顶部：品牌 + 标题 =====
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('青沐 · 跑群周报', CANVAS_WIDTH / 2, 80);

      // 群名
      ctx.font = 'bold 48px sans-serif';
      ctx.fillText(report.groupName, CANVAS_WIDTH / 2, 160);

      // 周期
      ctx.font = '24px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillText(`${report.startDate} ~ ${report.endDate}`, CANVAS_WIDTH / 2, 200);

      // ===== 白色卡：总数据 =====
      this.drawRoundRect(ctx, 60, 250, CANVAS_WIDTH - 120, 200, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('本周战报', 90, 300);

      // 三列数据
      const colW = (CANVAS_WIDTH - 120) / 3;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0FAF8E';
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText(`${report.totalDistance}`, 60 + colW / 2, 380);
      ctx.fillText(`${report.totalCheckins}`, 60 + colW * 1.5, 380);
      ctx.fillText(`${report.totalMembers}`, 60 + colW * 2.5, 380);

      ctx.fillStyle = '#666';
      ctx.font = '22px sans-serif';
      ctx.fillText('总公里', 60 + colW / 2, 420);
      ctx.fillText('打卡数', 60 + colW * 1.5, 420);
      ctx.fillText('参与人数', 60 + colW * 2.5, 420);

      // ===== 冠军 =====
      if (report.champion) {
        ctx.fillStyle = '#1a1a1a';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('🏆 本周冠军', 90, 510);

        this.drawRoundRect(ctx, 90, 530, CANVAS_WIDTH - 180, 80, 12);
        ctx.fillStyle = '#FFF8E1';
        ctx.fill();
        ctx.fillStyle = '#FF6B35';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(report.champion.nickname, 110, 580);
        ctx.textAlign = 'right';
        ctx.fillStyle = '#FF6B35';
        ctx.font = 'bold 32px sans-serif';
        ctx.fillText(`${report.champion.distance} km`, CANVAS_WIDTH - 110, 580);
      }

      // ===== Top 5 列表 =====
      ctx.fillStyle = '#1a1a1a';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('🏃 群英榜 Top 5', 90, 670);

      const top5 = report.topMembers.slice(0, 5);
      top5.forEach((m, i) => {
        const y = 720 + i * 70;
        this.drawRoundRect(ctx, 90, y, CANVAS_WIDTH - 180, 60, 8);
        ctx.fillStyle = '#ffffff';
        ctx.fill();

        // 排名
        ctx.fillStyle = i === 0 ? '#FF6B35' : '#999';
        ctx.font = 'bold 28px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${m.rank}`, 130, y + 40);

        // 昵称
        ctx.fillStyle = '#1a1a1a';
        ctx.font = '24px sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(m.nickname, 170, y + 40);

        // 距离
        ctx.fillStyle = '#0FAF8E';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`${m.distance} km`, CANVAS_WIDTH - 110, y + 40);
      });

      // ===== 底部：品牌 =====
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('青沐生命科技 · 扫码加入我们', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 50);
    });
  },

  drawRoundRect(
    ctx: WechatMiniprogram.CanvasContext,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ) {
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
  },

  async onSavePoster() {
    if (!this.data.canvasReady) {
      wx.showToast({ title: '战报图未就绪', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '保存中...' });
    try {
      const query = wx.createSelectorQuery();
      const canvas = await new Promise<WechatMiniprogram.Canvas>((resolve) => {
        query.select('#posterCanvas').node().exec((res) => resolve(res[0]?.node as WechatMiniprogram.Canvas));
      });
      const tempFilePath = await new Promise<string>((resolve, reject) => {
        wx.canvasToTempFilePath(
          { canvas, success: (r) => resolve(r.tempFilePath), fail: reject },
          this,
        );
      });
      await new Promise<void>((resolve, reject) => {
        wx.saveImageToPhotosAlbum({ filePath: tempFilePath, success: () => resolve(), fail: reject });
      });
      wx.showToast({ title: '已保存到相册', icon: 'success' });
    } catch (err) {
      const msg = (err as WechatMiniprogram.GeneralCallbackResult).errMsg ?? '';
      if (msg.includes('auth deny')) {
        wx.showModal({ title: '提示', content: '需要您授权保存到相册', confirmText: '去设置' });
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } finally {
      wx.hideLoading();
    }
  },

  /** 订阅下周报（stub：真实需 模板 ID） */
  onSubscribe() {
    wx.requestSubscribeMessage({
      tmplIds: ['WEEKLY_REPORT_TPL_ID'], // TODO Phase 4.5：替换为真实模板 ID
      success: (res) => {
        if (res['WEEKLY_REPORT_TPL_ID'] === 'accept') {
          wx.showToast({ title: '订阅成功', icon: 'success' });
        } else {
          wx.showToast({ title: '已拒绝', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '订阅失败（需模板 ID）', icon: 'none' });
      },
    });
  },
});
