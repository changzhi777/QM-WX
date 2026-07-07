// components/entry-grid/index.ts — 通用入口网格组件（V0.1.35，4 列 emoji 网格）
//
// 复用：sport/mall 等页面的功能入口网格（DRY）
// properties.items: [{ icon, label, url, badge? }]
// 点击：wx.navigateTo({ url })

interface EntryItem {
  icon: string; // emoji（如 '👟'）
  label: string; // 文字（如 '跑鞋'）
  url: string; // 跳转路径（如 '/pages/shoes/index'）
  badge?: number; // 红点数字（如未读数）
}

Component({
  properties: {
    items: {
      type: Array,
      value: [] as EntryItem[],
    },
    title: {
      type: String,
      value: '',
    },
  },
  methods: {
    onTap(e: WechatMiniprogram.TouchEvent) {
      const url = e.currentTarget.dataset.url as string;
      if (url) wx.navigateTo({ url });
    },
  },
});
