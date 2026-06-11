// pages/sport/index.ts
import { api } from '../../services/api';
import { ensureLogin } from '../../utils/auth';
import { formatPace, formatDistance } from '../../utils/format';

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

    form: {
      distance: '',
      durationMin: '',
      pace: '',
      heartRate: '',
      cadence: '',
      groupId: '',
    },
    groupIndex: 0,
    groups: [] as Group[],

    submitting: false,
    showCreateGroup: false,
    newGroupName: '',
  },

  onShow() {
    this.loadAll();
  },

  async loadAll() {
    try {
      await ensureLogin();
    } catch {
      return;
    }

    // 我的群
    const { groups } = await api.call<{ groups: Group[] }>('sport', 'myGroups');
    const groupOptions = [{ id: '', name: '不加入群' }, ...groups];
    this.setData({ groups: groupOptions });

    // 今日状态
    const today = await api.call<{ date: string; done: boolean; checkin: null | { points: number } }>(
      'sport',
      'today',
    );
    this.setData({
      today: today.date,
      todayDone: today.done,
      todayPoints: today.checkin?.points ?? 0,
    });
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
      const payload: Record<string, unknown> = { distance };
      if (durationMin > 0) payload.durationSec = Math.round(durationMin * 60);
      if (this.data.form.pace) payload.pace = this.data.form.pace;
      if (this.data.form.heartRate) payload.heartRate = Number(this.data.form.heartRate);
      if (this.data.form.cadence) payload.cadence = Number(this.data.form.cadence);
      if (this.data.form.groupId) payload.groupId = this.data.form.groupId;

      const result = await api.call<{ points: number }>('sport', 'checkin', payload);

      this.setData({
        todayDone: true,
        todayPoints: result.points,
        form: { distance: '', durationMin: '', pace: '', heartRate: '', cadence: '', groupId: '' },
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
});

// 避免 lint 警告
void formatDistance;
