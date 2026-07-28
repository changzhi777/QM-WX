// pages/about/index.ts — 关于沐禾健康（V0.3.10 架构图 v2.0 调整·Tab3 入口）
Page({
  data: {
    version: 'v0.3.9',
    brandName: '沐禾健康',
    company: '湖南青沐生命科技有限公司',
    desc: '用 AI 让健康管理更简单 — 数据整合 + AI 解读 + 个性化目标闭环',
    features: [
      { icon: '📊', title: '今日健康总览', desc: '步数/心率/睡眠/健康评分一站式查看' },
      { icon: '🤖', title: 'AI 健康助手', desc: 'GLM v4 流式对话 + 多模态识图解读' },
      { icon: '🎯', title: '健康目标闭环', desc: '7 类目标 + 进度追踪 + 友好失败' },
      { icon: '📁', title: '健康资料解读', desc: '运动文件/截图 AI 解读 + 历史回看' },
    ],
  },

  onShareAppMessage() {
    return {
      title: '沐禾健康 — AI 健康管理小程序',
      path: '/pages/index/index',
    };
  },

  onTapAgreement() {
    wx.navigateTo({ url: '/pages/agreement/index' });
  },

  onTapCopy() {
    wx.setClipboardData({
      data: '沐禾健康（青沐生命科技）',
      success: () => wx.showToast({ title: '已复制', icon: 'success' }),
    });
  },
});

export {};
