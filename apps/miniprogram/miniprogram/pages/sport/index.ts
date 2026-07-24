// pages/sport/index.ts
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';
import { formatPace, formatDistance } from '../../utils/format';
import { totalDistance, calcPace, formatPaceStr } from '../../utils/gps';
import type { GpsPoint } from '../../utils/gps';

/** Canvas 海报绘制上下文（小程序无 DOM lib，自定义绘制操作类型）*/
interface PosterCtx {
  fillStyle: string | { addColorStop: (offset: number, color: string) => void };
  font: string;
  textAlign: string;
  scale: (x: number, y: number) => void;
  createLinearGradient: (x0: number, y0: number, x1: number, y1: number) => { addColorStop: (offset: number, color: string) => void };
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (text: string, x: number, y: number) => void;
}

interface Group {
  id: string;
  name: string;
  memberCount: number;
  role: 'owner' | 'member';
}

Page({
  data: {
    today: new Date().toISOString().slice(0, 10),
    todayDone: false,
    todayPoints: 0,
    todayCheckin: null as { distance?: number; durationSec?: number; pace?: string; points: number } | null,

    form: {
      distance: '',
      durationMin: '',
      pace: '',
      heartRate: '',
      cadence: '',
      groupId: '',
      shoeId: '',
    },
    groupIndex: 0,
    groups: [] as Group[],
    // 跑鞋选项（V0.1.26 + 1：打卡选跑鞋 → 自动累计里程）
    shoeIndex: 0,
    shoes: [] as Array<{ id: string; name: string }>,

    submitting: false,
    showCreateGroup: false,
    newGroupName: '',

    error: false,
    errorMsg: '',
    gpsRunning: false,  // V0.3 GPS 跑步中
    gpsDistance: 0,     // km（实时）
    gpsDuration: 0,     // sec（实时）
    gpsPace: '—',       // V0.3 实时配速 M'SS"
    gpsPaused: false,   // V0.3 暂停状态（不计时长/距离）
    gpsPoints: [] as GpsPoint[],  // 轨迹点
    gpsPolyline: [] as Array<{ points: Array<{ latitude: number; longitude: number }>; color: string; width: number }>,
    gpsMarkers: [] as Array<{ id: number; latitude: number; longitude: number; callout: object }>,
    posterImagePath: '',  // V0.3 阶段 C Canvas 海报路径

    // V0.1.35 运动入口网格（14 项分 4 段，entry-grid 组件渲染，从 mine 分散到运动 tab）
    sportTools: [
      { icon: '👟', label: '我的跑鞋', url: '/pages/shoes/index' },
      { icon: '📊', label: '跑者数据', url: '/pages/runner/index' },
    ],
    dataRanks: [
      { icon: '🏅', label: '我的榜单', url: '/pages/ranking/index' },
      { icon: '📋', label: '佳明数据', url: '/pages/device/index?tab=garmin' },
    ],
    healthDevices: [
      { icon: '💊', label: '今日健康', url: '/pages/health/index' },
      { icon: '💪', label: '锻炼训练', url: '/pages/training/index' },
    ],
    socialEvents: [
      { icon: '📰', label: '运动动态', url: '/pages/feed/index' },
      { icon: '📍', label: '赛事·本地', url: '/pages/content-list/index' },
    ],
  },

  // V0.3 GPS 跑步（非响应式属性）
  _gpsTimer: null as number | null,
  _gpsStartTime: 0,
  _gpsPauseStart: 0,  // V0.3 暂停开始时间戳

  onShow() {
    this.loadAll();
  },

  async loadAll() {
    this.setData({ error: false, errorMsg: '' });
    try {
      await ensureLogin();
    } catch {
      // 未登录不视作错误，UI 引导即可
      return;
    }

    try {
      // 我的群
      const { groups } = await api.call<{ groups: Group[] }>('sport', 'myGroups');
      // "不加入群"占位项 + 真实群列表（补全 memberCount/role 默认值以满足 Group 类型）
      const groupOptions: Group[] = [
        { id: '', name: '不加入群', memberCount: 0, role: 'member' },
        ...groups,
      ];
      this.setData({ groups: groupOptions });

      // 我的跑鞋（active，打卡时选 → 自动累计里程，V0.1.26）
      try {
        const shoesRes = await api.call<{
          shoes: Array<{
            id: string;
            brand: string;
            model: string;
            nickname: string | null;
            status: string;
          }>;
        }>('shoes', 'list', {});
        const activeShoes = shoesRes.shoes.filter((s) => s.status === 'active');
        this.setData({
          shoes: [
            { id: '', name: '不选跑鞋' },
            ...activeShoes.map((s) => ({
              id: s.id,
              name: s.nickname || `${s.brand} ${s.model}`,
            })),
          ],
        });
      } catch {
        // 跑鞋加载失败不阻塞打卡（向后兼容）
      }

      // 今日状态
      const today = await api.call<{ date: string; done: boolean; checkin: null | { distance?: number; durationSec?: number; pace?: string; points: number } }>(
        'sport',
        'today',
      );
      this.setData({
        today: today.date,
        todayDone: today.done,
        todayPoints: today.checkin?.points ?? 0,
        todayCheckin: today.checkin,
      });
    } catch (e) {
      this.setData({
        error: true,
        errorMsg: (e as Error).message ?? '加载运动数据失败',
      });
    }
  },

  // ===== 表单 =====

  onInputDistance(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.distance': e.detail.value });
    this.recalcPace();
  },
  onInputDuration(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.durationMin': e.detail.value });
    this.recalcPace();
  },
  onInputHeartRate(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.heartRate': e.detail.value });
  },
  onInputCadence(e: WechatMiniprogram.CustomEvent) {
    this.setData({ 'form.cadence': e.detail.value });
  },

  onGroupChange(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.detail.value);
    this.setData({
      groupIndex: idx,
      'form.groupId': this.data.groups[idx]?.id ?? '',
    });
  },

  /** 选跑鞋（V0.1.26：打卡带 shoeId → 跑鞋自动累计里程） */
  onShoeChange(e: WechatMiniprogram.CustomEvent) {
    const idx = Number(e.detail.value);
    this.setData({
      shoeIndex: idx,
      'form.shoeId': this.data.shoes[idx]?.id ?? '',
    });
  },

  /** 时长（分钟）→ 配速 mm:ss（秒/公里） */
  recalcPace() {
    const d = parseFloat(this.data.form.distance);
    const min = parseFloat(this.data.form.durationMin);
    if (d > 0 && min > 0) {
      const secPerKm = (min * 60) / d;
      this.setData({ 'form.pace': formatPace(secPerKm) });
    } else {
      this.setData({ 'form.pace': '' });
    }
  },

  async onSubmitCheckin() {
    if (this.data.submitting) return;
    if (this.data.todayDone) {
      wx.showToast({ title: '今日已打卡', icon: 'none' });
      return;
    }

    const distance = parseFloat(this.data.form.distance);
    const durationMin = parseFloat(this.data.form.durationMin);

    if (!distance || distance < 0.5 || distance > 50) {
      wx.showToast({ title: '距离 0.5-50 km', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });
    try {
      // V0.2.0 采定位（授权失败/拒绝不阻塞打卡，后端天气快照留 null）
      let lat: number | undefined;
      let lon: number | undefined;
      try {
        const loc = await new Promise<WechatMiniprogram.GetLocationSuccessCallbackResult>((resolve, reject) => {
          wx.getLocation({ type: 'gcj02', success: resolve, fail: reject });
        });
        lat = loc.latitude;
        lon = loc.longitude;
      } catch {
        // 用户拒绝定位或无权限，跳过天气快照（关联分析样本减少，可接受）
      }

      const payload: Record<string, unknown> = { distance };
      if (durationMin > 0) payload.durationSec = Math.round(durationMin * 60);
      if (this.data.form.pace) payload.pace = this.data.form.pace;
      if (this.data.form.heartRate) payload.heartRate = Number(this.data.form.heartRate);
      if (this.data.form.cadence) payload.cadence = Number(this.data.form.cadence);
      if (this.data.form.groupId) payload.groupId = this.data.form.groupId;
      if (this.data.form.shoeId) payload.shoeId = this.data.form.shoeId;
      if (lat != null && lon != null) {
        payload.lat = lat;
        payload.lon = lon;
      }

      const result = await api.call<{ points: number }>('sport', 'checkin', payload);

      this.setData({
        todayDone: true,
        todayPoints: result.points,
        form: { distance: '', durationMin: '', pace: '', heartRate: '', cadence: '', groupId: '', shoeId: '' },
        shoeIndex: 0,
      });
      wx.showToast({ title: `+${result.points} 积分`, icon: 'success' });
    } catch (err) {
      wx.showToast({ title: (err as Error).message ?? '打卡失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  // ===== 我的群 =====

  goGroup(e: WechatMiniprogram.CustomEvent<{ id: string }>) {
    const id = e.currentTarget.dataset.id as string;
    if (!id) return;
    wx.navigateTo({ url: `/pages/group-detail/index?id=${id}` });
  },

  onTapCreateGroup() {
    this.setData({ showCreateGroup: true });
  },

  onCancelCreate() {
    this.setData({ showCreateGroup: false, newGroupName: '' });
  },

  onInputGroupName(e: WechatMiniprogram.CustomEvent) {
    this.setData({ newGroupName: e.detail.value });
  },

  async onConfirmCreate() {
    const name = this.data.newGroupName.trim();
    if (!name) {
      wx.showToast({ title: '请输入群名', icon: 'none' });
      return;
    }
    try {
      const { group } = await api.call<{ group: Group }>('sport', 'createGroup', { name });
      wx.showToast({ title: '已创建', icon: 'success' });
      this.setData({ showCreateGroup: false, newGroupName: '' });
      this.loadAll();
      // 跳到新群详情
      wx.navigateTo({ url: `/pages/group-detail/index?id=${group.id}` });
    } catch (err) {
      wx.showToast({ title: (err as Error).message ?? '创建失败', icon: 'none' });
    }
  },

  onTapJoinGroup() {
    wx.showModal({
      title: '加入群',
      placeholderText: '请输入群 ID',
      editable: true,
      success: async (res) => {
        if (!res.confirm || !res.content) return;
        const groupId = res.content.trim();
        try {
          await api.call('sport', 'joinGroup', { groupId });
          wx.showToast({ title: '已加入', icon: 'success' });
          this.loadAll();
          wx.navigateTo({ url: `/pages/group-detail/index?id=${groupId}` });
        } catch (err) {
          wx.showToast({ title: (err as Error).message ?? '加入失败', icon: 'none' });
        }
      },
    });
  },

  /** V0.3 GPS 跑步：开始记录轨迹（前台每 5s 定位一次）*/
  async startGpsRun() {
    if (this.data.gpsRunning || this.data.todayDone) return;
    wx.showLoading({ title: '定位中...' });
    try {
      const first = await this.getLocationOnce();
      wx.hideLoading();
      this._gpsStartTime = Date.now();
      this._gpsPauseStart = 0;
      const startPoints: GpsPoint[] = [{ latitude: first.latitude, longitude: first.longitude, timestamp: Date.now() }];
      this.setData({
        gpsRunning: true,
        gpsPoints: startPoints,
        gpsDistance: 0,
        gpsDuration: 0,
        gpsPace: '—',
        ...this.computeGpsOverlay(startPoints),
      });
      this._gpsTimer = setInterval(() => { void this.onGpsTick(); }, 5000) as unknown as number;
    } catch {
      wx.hideLoading();
      wx.showToast({ title: 'GPS 定位失败，检查授权', icon: 'none' });
    }
  },

  async onGpsTick() {
    try {
      const loc = await this.getLocationOnce();
      const points: GpsPoint[] = [...this.data.gpsPoints, { latitude: loc.latitude, longitude: loc.longitude, timestamp: Date.now() }];
      const dist = totalDistance(points);
      const dur = Math.floor((Date.now() - this._gpsStartTime) / 1000);
      const pace = calcPace(dist, dur);
      this.setData({
        gpsPoints: points,
        gpsDistance: dist,
        gpsDuration: dur,
        gpsPace: pace ? formatPaceStr(pace) : '—',
        ...this.computeGpsOverlay(points),
      });
    } catch {
      // 单次定位失败静默（继续记录后续点）
    }
  },

  /** V0.3 GPS 停止：算总距离 + 时长 + 配速，填入表单 */
  stopGpsRun() {
    if (this._gpsTimer) { clearInterval(this._gpsTimer); this._gpsTimer = null; }
    const dist = this.data.gpsDistance;
    const dur = this.data.gpsDuration;
    const pace = calcPace(dist, dur);
    this.setData({
      gpsRunning: false,
      gpsPaused: false,
      'form.distance': dist > 0 ? dist.toFixed(2) : '',
      'form.durationMin': dur > 0 ? String(Math.round(dur / 60)) : '',
      'form.pace': pace ? formatPaceStr(pace) : '',
    });
    if (dist > 0) wx.showToast({ title: `GPS 记录 ${dist.toFixed(2)}km`, icon: 'success' });
  },

  getLocationOnce(): Promise<WechatMiniprogram.GetLocationSuccessCallbackResult> {
    return new Promise((resolve, reject) => {
      wx.getLocation({ type: 'gcj02', success: resolve, fail: reject } as WechatMiniprogram.GetLocationOption);
    });
  },

  /** V0.3 GPS 轨迹地图 overlay（polyline 连线 + 起点终点 markers）*/
  computeGpsOverlay(points: GpsPoint[]) {
    if (points.length === 0) return { gpsPolyline: [], gpsMarkers: [] };
    const coords = points.map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    const polyline = coords.length > 1 ? [{ points: coords, color: '#2D9D78', width: 6 }] : [];
    const markers: Array<{ id: number; latitude: number; longitude: number; callout: object }> = [
      { id: 0, latitude: points[0].latitude, longitude: points[0].longitude, callout: { content: '起', padding: 6, borderRadius: 6, display: 'ALWAYS' } },
    ];
    if (points.length > 1) {
      const last = points[points.length - 1];
      markers.push({ id: 1, latitude: last.latitude, longitude: last.longitude, callout: { content: '当前', padding: 6, borderRadius: 6, display: 'ALWAYS' } });
    }
    return { gpsPolyline: polyline, gpsMarkers: markers };
  },

  /** P3 打卡成就分享（2.7 分享子项，Canvas 海报留 v0.3）*/
  onShareAppMessage() {
    const c = this.data.todayCheckin;
    if (c) {
      return {
        title: `我刚跑步 ${c.distance} km，配速 ${c.pace}，+${c.points} 积分！来沐禾健康一起跑 🏃`,
        path: '/pages/sport/index',
      };
    }
    return {
      title: '来沐禾健康，记录每一次跑步 🏃',
      path: '/pages/sport/index',
    };
  },

  /** V0.3 GPS 暂停（红绿灯等，停止 setInterval，不计时长/距离）*/
  onPauseGps() {
    if (!this.data.gpsRunning || this.data.gpsPaused) return;
    if (this._gpsTimer) { clearInterval(this._gpsTimer); this._gpsTimer = null; }
    this._gpsPauseStart = Date.now();
    this.setData({ gpsPaused: true });
  },

  /** V0.3 GPS 继续（_gpsStartTime 后移暂停期，时长扣暂停）*/
  onResumeGps() {
    if (!this.data.gpsPaused) return;
    if (this._gpsPauseStart > 0) {
      this._gpsStartTime += Date.now() - this._gpsPauseStart;
      this._gpsPauseStart = 0;
    }
    this.setData({ gpsPaused: false });
    this._gpsTimer = setInterval(() => { void this.onGpsTick(); }, 5000) as unknown as number;
  },

  /** V0.3 GPS 阶段 C：Canvas 生成打卡海报 */
  onGeneratePoster() {
    const c = this.data.todayCheckin;
    if (!c) { wx.showToast({ title: '请先打卡', icon: 'none' }); return; }
    wx.showLoading({ title: '生成中...' });
    const query = wx.createSelectorQuery();
    query.select('#posterCanvas').fields({ node: true, size: true }).exec((res) => {
      const canvas = res[0].node as { width: number; height: number; getContext: (t: string) => PosterCtx };
      const ctx = canvas.getContext('2d');
      const dpr = wx.getWindowInfo().pixelRatio;
      const W = 300, H = 420;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      ctx.scale(dpr, dpr);
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#2D9D78');
      grad.addColorStop(1, '#1a7a5a');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText('沐禾健康 · 跑步打卡', W / 2, 50);
      ctx.font = 'bold 60px sans-serif';
      ctx.fillText(`${c.distance}`, W / 2, 145);
      ctx.font = '18px sans-serif';
      ctx.fillText('km', W / 2, 172);
      ctx.font = 'bold 22px sans-serif';
      ctx.fillText(`配速 ${c.pace}`, W / 2, 225);
      ctx.fillText(`+${c.points} 积分`, W / 2, 262);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(this.data.today, W / 2, 395);
      wx.canvasToTempFilePath({
        canvas: canvas as never,
        success: (r) => { wx.hideLoading(); this.setData({ posterImagePath: r.tempFilePath }); },
        fail: () => { wx.hideLoading(); wx.showToast({ title: '生成失败', icon: 'none' }); },
      });
    });
  },

  /** V0.3 保存海报到相册 */
  onSavePoster() {
    if (!this.data.posterImagePath) return;
    wx.saveImageToPhotosAlbum({
      filePath: this.data.posterImagePath,
      success: () => wx.showToast({ title: '已保存相册', icon: 'success' }),
      fail: () => wx.showToast({ title: '保存失败（检查授权）', icon: 'none' }),
    });
  },
});

// 避免 lint 警告
void formatDistance;
