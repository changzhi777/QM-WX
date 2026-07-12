/**
 * components/certificate-poster — 证书分享海报 Canvas 2d 生成（V0.1.135）
 *
 * Props:
 *  - certificate: { type, title, desc?, achievedAt?, currentKm? }
 *  - user: { avatarUrl, nickname }
 *  - width: 750 (px)
 *  - height: 1334 (px，类似 9:16 比例)
 *
 * 流程：drawCanvas → wx.canvasToTempFilePath 返 tempFilePath → wx.saveImageToPhotosAlbum
 */
interface Certificate {
  type: 'milestone' | 'marathon' | 'pace_progress' | 'consecutive_checkin' | 'group_contribution' | 'custom';
  title: string;
  desc?: string;
  achievedAt?: string | null;
  currentKm?: number;
}

interface User {
  avatarUrl: string | null;
  nickname: string | null;
}

Component({
  properties: {
    certificate: { type: Object, value: {} as Certificate },
    user: { type: Object, value: { avatarUrl: null, nickname: '' } as User },
    width: { type: Number, value: 750 },
    height: { type: Number, value: 1334 },
  },

  methods: {
    /** 生成海报（Promise<tempFilePath>） */
    async generate(): Promise<string> {
      const query = this.createSelectorQuery();
      return new Promise((resolve, reject) => {
        query
          .select('#posterCanvas')
          .fields({ node: true, size: true })
          .exec(async (res) => {
            const canvasInfo = res?.[0];
            if (!canvasInfo || !canvasInfo.node) {
              reject(new Error('canvas node not found'));
              return;
            }
            try {
              const canvas = canvasInfo.node;
              const ctx = canvas.getContext('2d') as unknown as {
                scale: (sx: number, sy: number) => void;
                fillStyle: string;
                fillRect: (x: number, y: number, w: number, h: number) => void;
                createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => any;
                fillText: (text: string, x: number, y: number) => void;
                font: string;
                textAlign: string;
                textBaseline: string;
                beginPath: () => void;
                arc: (x: number, y: number, r: number, start: number, end: number) => void;
                fill: () => void;
                drawImage: (img: any, x: number, y: number, w: number, h: number) => void;
              };
              const W = this.data.width;
              const H = this.data.height;
              const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2;
              canvas.width = W * dpr;
              canvas.height = H * dpr;
              ctx.scale(dpr, dpr);

              // 1. 渐变背景（品牌色 → 深绿）
              const gradient = ctx.createLinearGradient(0, 0, 0, H);
              gradient.addColorStop(0, '#0FAF8E');
              gradient.addColorStop(1, '#0a6f5e');
              ctx.fillStyle = gradient;
              ctx.fillRect(0, 0, W, H);

              // 2. 标题
              ctx.fillStyle = '#fff';
              ctx.font = 'bold 60px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText('🎉 跑步证书 🎉', W / 2, 120);

              // 3. 用户头像（圆形）
              const avatarUrl = this.data.user?.avatarUrl;
              if (avatarUrl) {
                try {
                  const img = canvas.createImage();
                  await new Promise<void>((res, rej) => {
                    img.onload = () => res();
                    img.onerror = () => rej(new Error('avatar load fail'));
                    img.src = avatarUrl;
                  });
                  ctx.beginPath();
                  ctx.arc(W / 2, 280, 80, 0, Math.PI * 2);
                  ctx.fillStyle = '#fff';
                  ctx.fill();
                  ctx.drawImage(img, W / 2 - 75, 205, 150, 150);
                } catch {
                  // 头像加载失败跳过
                }
              }

              // 4. 昵称
              ctx.fillStyle = '#fff';
              ctx.font = 'bold 36px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(this.data.user?.nickname || '跑者', W / 2, 420);

              // 5. 证书标题
              ctx.font = 'bold 80px sans-serif';
              ctx.fillText(this.data.certificate?.title || '', W / 2, 600);

              // 6. 证书描述
              ctx.font = '32px sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.85)';
              if (this.data.certificate?.desc) {
                ctx.fillText(this.data.certificate.desc, W / 2, 700);
              }

              // 7. 总跑量（如有）
              if (this.data.certificate?.currentKm) {
                ctx.font = 'bold 100px sans-serif';
                ctx.fillStyle = '#FFD700';
                ctx.fillText(`${this.data.certificate.currentKm} km`, W / 2, 870);
              }

              // 8. 达成日期
              if (this.data.certificate?.achievedAt) {
                ctx.font = '28px sans-serif';
                ctx.fillStyle = 'rgba(255,255,255,0.8)';
                ctx.fillText(
                  `达成：${this.data.certificate.achievedAt}`,
                  W / 2,
                  this.data.certificate?.currentKm ? 960 : 870,
                );
              }

              // 9. 品牌签名
              ctx.font = '24px sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.6)';
              ctx.textBaseline = 'bottom';
              ctx.fillText('青沐 · QM-WX', W / 2, H - 40);

              // 10. 转临时文件
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
        console.error('[certificate-poster] save failed', err);
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    },
  },
});