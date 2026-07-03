// pages/certificate/index.ts — 我的证书（V0.1.28，跑者向 — 里程碑 + 赛事）
import { api } from '../../services/api';

interface MilestoneCert {
  type: 'milestone';
  km: number;
  title: string;
  desc: string;
  currentKm: number;
}

interface MarathonCert {
  type: 'marathon';
  enrollmentId: string;
  contentId: string;
  title: string;
  date: string | null;
  location: string | null;
  cover: string | null;
  status: string;
}

interface CertsRes {
  totalDistance: number;
  totalCheckins: number;
  milestones: MilestoneCert[];
  marathons: MarathonCert[];
  nextMilestone: { km: number; title: string; desc: string } | null;
}

Page({
  data: {
    certs: null as CertsRes | null,
    loading: false,
    nextPercent: 0, // 下一里程碑进度百分比
  },

  onShow() {
    this.loadCerts();
  },

  /** 拉取证书（stats.myCertificates 动态生成） */
  async loadCerts() {
    this.setData({ loading: true });
    try {
      const res = await api.call<CertsRes>('stats', 'myCertificates', {});
      this.setData({
        certs: res,
        nextPercent: res.nextMilestone
          ? Math.min(100, Math.round((res.totalDistance / res.nextMilestone.km) * 100))
          : 100,
        loading: false,
      });
    } catch {
      this.setData({ loading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },
});
