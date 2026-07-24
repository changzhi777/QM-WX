// pages/strength/session.ts — 力量训练中（V0.2.120 训记式：自动计时 + 实时容量累加 + 动作 picker）
import { api } from '../../services/api';

interface SetItem {
  order: number;
  exerciseName: string;
  reps: number;
  weight: number;
}

interface ExerciseItem {
  id: string;
  name: string;
  category: string;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

Page({
  data: {
    sessionId: '',
    startedAt: 0,
    durationSec: 0,
    durationText: '00:00',
    totalVolume: 0,
    totalVolumeText: '0',
    // 动作 + 自定义
    exercises: [] as ExerciseItem[],
    exerciseIndex: -1,
    exerciseName: '',
    customName: '',
    // 一组
    reps: '',
    weight: '',
    setIndex: '1',
    // 已添加组
    sets: [] as SetItem[],
    // 完成
    notes: '',
    submitting: false,
  },

  timer: null as number | null,

  onLoad(query: Record<string, string | undefined>) {
    const sid = query.sessionId || '';
    this.setData({
      sessionId: sid,
      startedAt: Date.now(),
    });
    this.startTimer();
    this.loadExercises();
  },

  onUnload() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  /** 加载预设动作库 */
  async loadExercises() {
    try {
      const res = await api.call<{ items: ExerciseItem[] }>('strength', 'listExercises', {});
      this.setData({ exercises: res.items ?? [] });
    } catch {
      // 失败不阻塞，可手输入
    }
  },

  /** 启动计时（每秒刷新） */
  startTimer() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const sec = Math.floor((Date.now() - this.data.startedAt) / 1000);
      this.setData({
        durationSec: sec,
        durationText: formatDuration(sec),
      });
    }, 1000) as unknown as number;
  },

  onPickExercise(e: WechatMiniprogram.PickerChange) {
    const idx = Number(e.detail.value);
    const ex = this.data.exercises[idx];
    if (ex) {
      this.setData({
        exerciseIndex: idx,
        exerciseName: ex.name,
        customName: '',
      });
    }
  },

  onInputCustom(e: WechatMiniprogram.Input) {
    const v = e.detail.value;
    this.setData({ customName: v, exerciseIndex: -1, exerciseName: v ? v : '' });
  },

  onInputReps(e: WechatMiniprogram.Input) { this.setData({ reps: e.detail.value }); },
  onInputWeight(e: WechatMiniprogram.Input) { this.setData({ weight: e.detail.value }); },
  onInputSetIndex(e: WechatMiniprogram.Input) { this.setData({ setIndex: e.detail.value }); },
  onInputNotes(e: WechatMiniprogram.Input) { this.setData({ notes: e.detail.value }); },

  /** 添加一组：调 addSet → 累加容量 + 列表追加 */
  async onAddSet() {
    const name = (this.data.exerciseName || this.data.customName).trim();
    if (!name) {
      wx.showToast({ title: '请选择或输入动作', icon: 'none' });
      return;
    }
    const reps = Number(this.data.reps);
    const weight = Number(this.data.weight);
    const setIndex = Number(this.data.setIndex || '1');
    if (!reps || reps <= 0) {
      wx.showToast({ title: '请输入次数', icon: 'none' });
      return;
    }
    if (weight < 0 || isNaN(weight)) {
      wx.showToast({ title: '请输入重量', icon: 'none' });
      return;
    }
    try {
      const res = await api.call<{ set: { order: number }; session: { totalVolume: number } }>(
        'strength', 'addSet', {
          sessionId: this.data.sessionId,
          exerciseName: name,
          reps,
          weight,
          setIndex,
        },
      );
      const newSet: SetItem = {
        order: res.set?.order ?? this.data.sets.length + 1,
        exerciseName: name,
        reps,
        weight,
      };
      const sets = [...this.data.sets, newSet];
      this.setData({
        sets,
        totalVolume: res.session?.totalVolume ?? this.data.totalVolume + reps * weight,
        totalVolumeText: String(res.session?.totalVolume ?? this.data.totalVolume + reps * weight),
        reps: '',
        weight: '',
        setIndex: String(setIndex + 1),
      });
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '添加失败', icon: 'none' });
    }
  },

  /** 完成训练：finishSession → 返回列表 */
  async onFinish() {
    if (this.data.submitting) return;
    if (this.data.sets.length === 0) {
      wx.showModal({
        title: '还没添加组',
        content: '本次训练尚无组记录，是否仍要完成？',
        success: async (r) => { if (r.confirm) await this.doFinish(); },
      });
      return;
    }
    await this.doFinish();
  },

  async doFinish() {
    this.setData({ submitting: true });
    try {
      await api.call('strength', 'finishSession', {
        sessionId: this.data.sessionId,
        durationSec: this.data.durationSec,
        notes: this.data.notes || undefined,
      });
      wx.showToast({ title: '训练已完成', icon: 'success' });
      setTimeout(() => {
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/mine/index' }) });
      }, 800);
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
