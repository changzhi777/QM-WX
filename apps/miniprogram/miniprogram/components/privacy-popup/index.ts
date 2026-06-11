// components/privacy-popup/index.ts
// 首启隐私协议弹窗（小程序提审要求）

Component({
  options: { multipleSlots: true },
  properties: {
    visible: { type: Boolean, value: false },
  },
  methods: {
    onAgree() {
      wx.setStorageSync('privacyAgreed', true);
      this.triggerEvent('agree');
    },
    onOpenAgreement() {
      wx.navigateTo({ url: '/pages/agreement/index' });
    },
  },
});
