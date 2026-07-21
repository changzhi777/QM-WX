/**
 * components/collection-poster — 收藏合集海报（V0.1.136）
 *
 * Props:
 *  - title: 合集标题
 *  - items: Array<{ title, cover?, type: 'content'|'product' }>
 *  - user: { nickname, avatarUrl }
 *  - width: 750 (px)
 *  - height: 1334 (px)
 */
interface PosterItem {
  title: string;
  cover?: string | null;
  type: 'content' | 'product';
}

interface User {
  nickname: string | null;
  avatarUrl: string | null;
}

Component({
  properties: {
    title: { type: String, value: '我的收藏合集' },
    items: { type: Array, value: [] as PosterItem[] },
    user: { type: Object, value: { nickname: '', avatarUrl: null } as User },
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
              const ctx = canvas.getContext('2d') as unknown as any;
              const W = this.data.width;
              const H = this.data.height;
              const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2;
              canvas.width = W * dpr;
              canvas.height = H * dpr;
              ctx.scale(dpr, dpr);

              // 1. 浅色背景
              ctx.fillStyle = '#fff';
              ctx.fillRect(0, 0, W, H);

              // 2. 顶部品牌色块
              ctx.fillStyle = '#0FAF8E';
              ctx.fillRect(0, 0, W, 200);

              // 3. 标题
              ctx.fillStyle = '#fff';
              ctx.font = 'bold 56px sans-serif';
              ctx.textAlign = 'center';
              ctx.fillText(this.data.title, W / 2, 110);

              // 4. 用户昵称
              ctx.font = '28px sans-serif';
              ctx.fillStyle = 'rgba(255,255,255,0.85)';
              ctx.fillText(`${this.data.user?.nickname || '跑者'} 的收藏`, W / 2, 165);

              // 5. 3x3 网格（封面图 + 标题）
              const items = this.data.items.slice(0, 9);
              const gridStartY = 260;
              const cellW = (W - 80) / 3;
              const cellH = cellW * 1.3;
              const gap = 20;

              for (let i = 0; i < items.length; i++) {
                const col = i % 3;
                const row = Math.floor(i / 3);
                const x = 40 + col * (cellW + gap / 3);
                const y = gridStartY + row * (cellH + 30);

                // 封面图
                const cover = items[i].cover;
                if (cover) {
                  try {
                    const img = canvas.createImage();
                    await new Promise<void>((res, rej) => {
                      img.onload = () => res();
                      img.onerror = () => rej(new Error('img load fail'));
                      img.src = cover;
                    });
                    ctx.fillStyle = '#f5f5f5';
                    ctx.fillRect(x, y, cellW, cellH);
                    ctx.drawImage(img, x, y, cellW, cellH);
                  } catch {
                    ctx.fillStyle = '#eee';
                    ctx.fillRect(x, y, cellW, cellH);
                  }
                } else {
                  ctx.fillStyle = '#eee';
                  ctx.fillRect(x, y, cellW, cellH);
                }

                // 类型 chip
                ctx.fillStyle = items[i].type === 'content' ? '#0FAF8E' : '#f59e0b';
                ctx.fillRect(x, y + cellH + 4, 60, 24);
                ctx.fillStyle = '#fff';
                ctx.font = '18px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(items[i].type === 'content' ? '内容' : '商品', x + 10, y + cellH + 22);

                // 标题
                ctx.fillStyle = '#222';
                ctx.font = '22px sans-serif';
                const title = items[i].title || '';
                const truncated = title.length > 8 ? title.slice(0, 8) + '...' : title;
                ctx.fillText(truncated, x, y + cellH + 60);
              }

              // 6. 底部品牌签名
              ctx.fillStyle = '#888';
              ctx.font = '24px sans-serif';
              ctx.textAlign = 'center';
              ctx.textBaseline = 'bottom';
              ctx.fillText('沐禾健康 · 收藏合集', W / 2, H - 40);

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
        console.error('[collection-poster] save failed', err);
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    },
  },
});