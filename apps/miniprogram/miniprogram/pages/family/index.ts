// pages/family/index.ts — 家庭空间（V0.1.34，pic 2776 家庭方向）
import { api } from '../../services/api';

interface FamilyMember {
  userId: string;
  nickname: string | null;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  monthDistance: number;
}
interface FamilyInfo {
  id: string;
  name: string;
  inviteCode: string;
  ownerId: string;
  memberCount: number;
  isOwner: boolean;
  members: FamilyMember[];
}
interface FamilyGoal {
  id: string;
  title: string | null;
  targetDistance: number;
  currentDistance: number;
  percent: number;
  completed: boolean;
}

interface Achievement {
  km: number;
  achieved: boolean;
  progress: number;
}

Page({
  data: {
    family: null as FamilyInfo | null,
    familyGoals: [] as FamilyGoal[],
    achievements: [] as Achievement[], // V0.1.39 家庭里程碑
    loading: false,
    // 创建/加入
    createName: '',
    joinCode: '',
    // 添加家庭目标
    goalVisible: false,
    goalType: 'monthly' as 'monthly' | 'yearly',
    goalDistance: '100',
    goalTitle: '',
  },

  onShow() {
    this.loadFamily();
  },

  /** 我的家庭（family.myFamily） */
  async loadFamily() {
    this.setData({ loading: true });
    try {
      const res = await api.call<{ family: FamilyInfo | null }>('family', 'myFamily', {});
      this.setData({ family: res.family, loading: false });
      if (res.family) {
        this.loadFamilyGoals();
        this.loadAchievements(); // V0.1.39 家庭成就
      }
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /** 家庭目标列表（goal.myFamilyGoals） */
  async loadFamilyGoals() {
    try {
      const res = await api.call<{ goals: FamilyGoal[] }>('goal', 'myFamilyGoals', {});
      this.setData({ familyGoals: res.goals });
    } catch {
      /* 失败不阻塞主页面 */
    }
  },

  /** V0.1.39 家庭成就（family.familyAchievements）*/
  async loadAchievements() {
    try {
      const res = await api.call<{ totalDistance: number; achievements: Achievement[] }>(
        'family',
        'familyAchievements',
        {},
      );
      this.setData({ achievements: res.achievements });
    } catch {
      /* 失败不阻塞 */
    }
  },

  // ===== 创建家庭 =====
  onInputCreate(e: WechatMiniprogram.Input) {
    this.setData({ createName: e.detail.value });
  },
  async onCreate() {
    const name = this.data.createName.trim();
    if (!name) {
      wx.showToast({ title: '请输入家庭名', icon: 'none' });
      return;
    }
    try {
      await api.call('family', 'createFamily', { name });
      wx.showToast({ title: '创建成功', icon: 'success' });
      this.setData({ createName: '' });
      this.loadFamily();
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '创建失败', icon: 'none' });
    }
  },

  // ===== 加入家庭 =====
  onInputJoin(e: WechatMiniprogram.Input) {
    this.setData({ joinCode: e.detail.value.toUpperCase() });
  },
  async onJoin() {
    const code = this.data.joinCode.trim();
    if (!code) {
      wx.showToast({ title: '请输入邀请码', icon: 'none' });
      return;
    }
    try {
      await api.call('family', 'joinFamily', { inviteCode: code });
      wx.showToast({ title: '加入成功', icon: 'success' });
      this.setData({ joinCode: '' });
      this.loadFamily();
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '加入失败', icon: 'none' });
    }
  },

  /** 邀请（复制邀请码到剪贴板） */
  onInvite() {
    const code = this.data.family?.inviteCode;
    if (!code) return;
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' }),
    });
  },

  /** 离开家庭（owner 不可离开） */
  onLeave() {
    wx.showModal({
      title: '离开家庭',
      content: '确定离开当前家庭吗？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('family', 'leaveFamily', {});
          wx.showToast({ title: '已离开', icon: 'success' });
          this.loadFamily();
        } catch (e) {
          wx.showToast({ title: (e as Error).message || '离开失败', icon: 'none' });
        }
      },
    });
  },

  /** V0.1.39 转让家长（showActionSheet 选成员 + 确认）*/
  async onTransferOwner() {
    const members = this.data.family?.members.filter((m) => m.role !== 'owner') ?? [];
    if (members.length === 0) {
      wx.showToast({ title: '没有其他成员可转让', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: members.map((m) => m.nickname || '跑者'),
      success: (res) => {
        const target = members[res.tapIndex];
        if (!target) return;
        wx.showModal({
          title: '转让家长',
          content: `确定将家长转让给「${target.nickname || '跑者'}」吗？你将变为普通成员。`,
          success: async (m) => {
            if (!m.confirm) return;
            try {
              await api.call('family', 'transferOwner', { newOwnerId: target.userId });
              wx.showToast({ title: '已转让', icon: 'success' });
              this.loadFamily();
            } catch (e) {
              wx.showToast({ title: (e as Error).message || '转让失败', icon: 'none' });
            }
          },
        });
      },
    });
  },

  /** V0.1.39 解散家庭（owner 确认 + delete Family 级联）*/
  onDissolve() {
    wx.showModal({
      title: '解散家庭',
      content: '确定解散当前家庭吗？所有成员和目标将被删除，不可恢复！',
      confirmColor: '#e64340',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('family', 'dissolveFamily', {});
          wx.showToast({ title: '已解散', icon: 'success' });
          this.loadFamily();
        } catch (e) {
          wx.showToast({ title: (e as Error).message || '解散失败', icon: 'none' });
        }
      },
    });
  },

  // ===== 家庭目标 =====
  onAddGoal() {
    this.setData({ goalVisible: true, goalType: 'monthly', goalDistance: '100', goalTitle: '' });
  },
  onPickGoalType(e: WechatMiniprogram.TouchEvent) {
    this.setData({ goalType: e.currentTarget.dataset.type as 'monthly' | 'yearly' });
  },
  onInputGoalTitle(e: WechatMiniprogram.Input) {
    this.setData({ goalTitle: e.detail.value });
  },
  onInputGoalDistance(e: WechatMiniprogram.Input) {
    this.setData({ goalDistance: e.detail.value });
  },
  async onSubmitGoal() {
    const familyId = this.data.family?.id;
    if (!familyId) return;
    const target = Number(this.data.goalDistance);
    if (!target || target < 1) {
      wx.showToast({ title: '目标距离需 ≥ 1', icon: 'none' });
      return;
    }
    try {
      await api.call('goal', 'addFamilyGoal', {
        familyId,
        type: this.data.goalType,
        targetDistance: target,
        title: this.data.goalTitle.trim() || undefined,
      });
      wx.showToast({ title: '已添加', icon: 'success' });
      this.setData({ goalVisible: false });
      this.loadFamilyGoals();
    } catch (e) {
      wx.showToast({ title: (e as Error).message || '添加失败', icon: 'none' });
    }
  },
  closeGoal() {
    this.setData({ goalVisible: false });
  },
});
