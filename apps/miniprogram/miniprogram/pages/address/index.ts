// pages/address/index.ts — 收货地址管理（V0.1.23）
import { api } from '../../services/api';

interface Address {
  id: string;
  name: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  detail: string;
  isDefault: boolean;
}

Page({
  data: {
    list: [] as Address[],
    loading: false,
    showForm: false,
    editingId: '',
    form: { name: '', phone: '', province: '', city: '', district: '', detail: '', isDefault: false },
  },

  onShow() {
    if (!this.data.showForm) this.load();
  },

  async load() {
    this.setData({ loading: true });
    try {
      const res = await api.call<{ list: Address[] }>('address', 'list', {});
      this.setData({ list: res.list, loading: false });
    } catch {
      this.setData({ loading: false });
    }
  },

  showCreate() {
    this.setData({
      showForm: true,
      editingId: '',
      form: { name: '', phone: '', province: '', city: '', district: '', detail: '', isDefault: this.data.list.length === 0 },
    });
  },

  showEdit(e: WechatMiniprogram.TouchEvent) {
    const addr = e.currentTarget.dataset.addr as Address;
    this.setData({ showForm: true, editingId: addr.id, form: { ...addr } });
  },

  onInput(e: WechatMiniprogram.CustomEvent) {
    const field = e.currentTarget.dataset.field as string;
    this.setData({ [`form.${field}`]: e.detail.value } as Record<string, unknown>);
  },

  toggleDefault() {
    this.setData({ 'form.isDefault': !this.data.form.isDefault } as Record<string, unknown>);
  },

  async submit() {
    const f = this.data.form;
    if (!f.name || !f.phone || !f.province || !f.detail) {
      wx.showToast({ title: '请填完整', icon: 'none' });
      return;
    }
    try {
      const action = this.data.editingId ? 'update' : 'create';
      const payload = this.data.editingId ? { id: this.data.editingId, ...f } : f;
      await api.call('address', action, payload);
      wx.showToast({ title: '保存成功', icon: 'success' });
      this.setData({ showForm: false });
      this.load();
    } catch {
      wx.showToast({ title: '保存失败', icon: 'none' });
    }
  },

  cancel() {
    this.setData({ showForm: false });
  },

  remove(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    wx.showModal({
      title: '删除地址',
      content: '确定删除该地址？',
      success: async (r) => {
        if (!r.confirm) return;
        try {
          await api.call('address', 'remove', { id });
          this.load();
        } catch {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      },
    });
  },

  async setDefault(e: WechatMiniprogram.TouchEvent) {
    const id = e.currentTarget.dataset.id as string;
    try {
      await api.call('address', 'setDefault', { id });
      this.load();
    } catch {
      wx.showToast({ title: '设置失败', icon: 'none' });
    }
  },
});
