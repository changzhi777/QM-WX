/**
 * components/collapsible — 折叠容器组件（V0.2.94 阶段 2.1：今日页智能折叠）
 *
 * 用法（页面 json 注册后）：
 *   <collapsible title="展开更多" open="{{false}}">
 *     <view>折叠内容...</view>
 *   </collapsible>
 *
 * 今日页用途：置顶常用模块（打卡/天气/目标/健康/排名/饮食），折叠次要（周报/动态/通知）
 */
Component({
  properties: {
    title: { type: String, value: '展开更多' },
    open: { type: Boolean, value: false },
  },
  methods: {
    toggle() {
      this.setData({ open: !this.data.open });
    },
  },
});
