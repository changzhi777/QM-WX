/**
 * components/mileage-chart — 里程曲线 Canvas 2d 手绘组件（V0.1.133）
 *
 * Props:
 *  - points: MileagePoint[] — { period, distanceKm, checkinCount }
 *  - width / height: 画布尺寸（px）
 *
 * 绘制步骤：
 *  1. 计算数据范围（min/max distanceKm）
 *  2. 绘制坐标轴 + Y 轴 5 个刻度
 *  3. 绘制 X 轴首/中/末 3 个 period 标签
 *  4. 绘制折线（lineTo）
 *  5. 绘制数据点（arc + fill）
 *  6. 最高点高亮（橙红 + label）
 */
interface MileagePoint {
  period: string;
  distanceKm: number;
  checkinCount: number;
}

Component({
  properties: {
    points: {
      type: Array,
      value: [] as Array<MileagePoint>,
    },
    width: {
      type: Number,
      value: 320,
    },
    height: {
      type: Number,
      value: 200,
    },
  },

  observers: {
    'points, width, height': function () {
      // 数据变化或尺寸变化 → 重绘
      this.drawChart();
    },
  },

  ready() {
    this.drawChart();
  },

  methods: {
    /** 主绘制入口 */
    drawChart() {
      const points = this.data.points || [];
      const W = this.data.width;
      const H = this.data.height;

      if (points.length === 0) return;

      const query = this.createSelectorQuery();
      query
        .select('#mileageChartCanvas')
        .fields({ node: true, size: true })
        .exec((res) => {
          const canvasInfo = res?.[0];
          if (!canvasInfo || !canvasInfo.node) return;
          const canvas = canvasInfo.node;
          const ctx = canvas.getContext('2d');

          // 高分屏适配
          const dpr = wx.getWindowInfo ? wx.getWindowInfo().pixelRatio : 2;
          canvas.width = W * dpr;
          canvas.height = H * dpr;
          ctx.scale(dpr, dpr);

          this.renderChart(ctx, W, H, points);
        });
    },

    /** 实际绘制逻辑 */
    renderChart(rawCtx: WechatMiniprogram.CanvasContext, W: number, H: number, points: MileagePoint[]) {
      // Canvas 2d 在 type="2d" 下，原生 API 直接可用，但 TS typings 是旧的 CanvasContext
      // 用方法形式（setTextAlign / setTextBaseline）保持类型兼容；运行时两者等价
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctx = rawCtx as any;

      // 内边距
      const padL = 40;
      const padR = 16;
      const padT = 20;
      const padB = 32;
      const innerW = W - padL - padR;
      const innerH = H - padT - padB;

      // 数据范围
      const maxKm = Math.max(...points.map((p) => p.distanceKm), 1);
      const yMax = Math.ceil(maxKm * 1.2); // 留 20% 余量
      const yStep = yMax / 4; // Y 轴 5 个刻度（0, 1/4, 2/4, 3/4, 4/4）

      // 背景
      ctx.clearRect(0, 0, W, H);

      // === Y 轴刻度 + 网格线 ===
      ctx.strokeStyle = '#eee';
      ctx.lineWidth = 1;
      ctx.font = '20px sans-serif';
      ctx.fillStyle = '#999';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      for (let i = 0; i <= 4; i++) {
        const y = padT + innerH - (innerH * i) / 4;
        const v = (yStep * i).toFixed(1);
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + innerW, y);
        ctx.stroke();
        ctx.fillText(v, padL - 6, y);
      }

      // === X 轴（首/中/末 3 个 period 标签）===
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const xPositions: number[] = [];
      const stepX = points.length === 1 ? 0 : innerW / (points.length - 1);
      for (let i = 0; i < points.length; i++) {
        const x = points.length === 1 ? padL + innerW / 2 : padL + stepX * i;
        xPositions.push(x);
        if (i === 0 || i === Math.floor((points.length - 1) / 2) || i === points.length - 1) {
          ctx.fillStyle = '#999';
          ctx.fillText(points[i].period, x, padT + innerH + 8);
        }
      }

      // === 折线 ===
      ctx.strokeStyle = '#0FAF8E';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const x = xPositions[i];
        const y = padT + innerH - (points[i].distanceKm / yMax) * innerH;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // === 数据点 + 最高点高亮 ===
      let maxIdx = 0;
      for (let i = 1; i < points.length; i++) {
        if (points[i].distanceKm > points[maxIdx].distanceKm) maxIdx = i;
      }

      for (let i = 0; i < points.length; i++) {
        const x = xPositions[i];
        const y = padT + innerH - (points[i].distanceKm / yMax) * innerH;
        const isMax = i === maxIdx;
        ctx.fillStyle = isMax ? '#ef4444' : '#0FAF8E';
        ctx.beginPath();
        ctx.arc(x, y, isMax ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();

        // 最高点 label
        if (isMax && points.length > 1) {
          ctx.fillStyle = '#ef4444';
          ctx.font = 'bold 22px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(`${points[i].distanceKm}km`, x, y - 10);
        }
      }
    },
  },
});