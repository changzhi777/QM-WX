/**
 * components/goal-share-card — 目标达成分享卡（V0.1.135）
 */
interface Goal {
  id: string;
  type: string;
  title: string | null;
  targetDistance: number;
  currentDistance: number;
  percent: number;
  completed: boolean;
}

interface User {
  avatarUrl: string | null;
  nickname: string | null;
}

Component({
  properties: {
    goal: { type: Object, value: {} as Goal },
    user: { type: Object, value: { avatarUrl: null, nickname: '' } as User },
    width: { type: Number, value: 750 },
    height: { type: Number, value: 1000 },
  },

  methods: {
    /** 生成分享卡（Promise<tempFilePath>） */
    async generate(): Promise<string> {
      const query = this.createSelectorQuery();
      return new Promise((resolve, reject) => {
        query
          .select('#shareCardCanvas')
          .fields({ node: true, size: true })
          .exec(async (res) => {
            const canvasInfo = res?.[0];
            if (!canvasInfo || !canvasInfo.node) {
              reject(new Error('canvas node not found'));
              return;
            }
            try {
              const canvas = canvasInfo.node;
              const ctx = canvas.getContext('2d') as unknown as any;
              const W = this.data.width;
              const H = this.data.height;
              const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2;
              canvas.width = W * dpr;
              canvas.height = H * dpr;
              ctx.scale(dpr, dpr);

              // 浅色背景
              ctx.fillStyle = '#f7f8fa';
              ctx.fillRect(0, 0, W, H);

              // 顶部彩色带
              const goal = this.data.goal;
              const completed = goal?.completed ?? false;
              const headerColor = completed ? '#0FAF8E' : '#f59e0b';
              ctx.fillStyle = headerColor;
              ctx.fillRect(0, 0, W, 200);

              // 标题
              ctx.fillStyle = '#fff';
              ctx.font = 'bold 48px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(completed ? '🎉 目标达成！' : '💪 继续加油', W / 2, 120);

              // 目标类型 + 标题
              ctx.font = '32px sans-serif';
              const typeLabel = goal?.type === 'monthly' ? '月度目标' : goal?.type === 'yearly' ? '年度目标' : '自定义目标';
              ctx.fillText(`${typeLabel} · ${goal?.title || '跑步目标'}`, W / 2, 280);

              // 大数字 currentDistance / targetDistance
              ctx.fillStyle = '#222';
              ctx.font = 'bold 120px sans-serif';
              ctx.fillText(`${goal?.currentDistance ?? 0}`, W / 2, 480);

              ctx.font = '32px sans-serif';
              ctx.fillStyle = '#888';
              ctx.fillText(`/ ${goal?.targetDistance ?? 0} km`, W / 2, 540);

              // 进度条
              const barW = W * 0.8;
              const barX = (W - barW) / 2;
              const barY = 620;
              ctx.fillStyle = '#e0e0e0';
              ctx.fillRect(barX, barY, barW, 30);
              ctx.fillStyle = headerColor;
              ctx.fillRect(barX, barY, barW * ((goal?.percent ?? 0) / 100), 30);

              // 百分比
              ctx.fillStyle = '#222';
              ctx.font = 'bold 64px sans-serif';
              ctx.fillText(`${goal?.percent ?? 0}%`, W / 2, 740);

              // 品牌签名
              ctx.font = '24px sans-serif';
              ctx.fillStyle = '#888';
              ctx.textBaseline = 'bottom';
              ctx.fillText('青沐 · QM-WX', W / 2, H - 40);

              wx.canvasToTempFilePath({
                canvas,
                success: (r) => resolve(r.tempFilePath),
                fail: (e) => reject(new Error(JSON.stringify(e))),
              });
            } catch (err) {
              reject(err);
            }
          });
      });
    },

    /** 保存到相册 */
    async saveToAlbum(): Promise<void> {
      try {
        const tempPath = await this.generate();
        await new Promise<void>((resolve, reject) => {
          wx.saveImageToPhotosAlbum({
            filePath: tempPath,
            success: () => resolve(),
            fail: (e) => reject(e),
          });
        });
        wx.showToast({ title: '已保存到相册', icon: 'success' });
      } catch (err) {
        console.error('[goal-share-card] save failed', err);
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    },
  },
});