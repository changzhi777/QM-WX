// components/error-state — 通用错误状态组件
//
// 用法：
//   <error-state wx:if="{{error}}" message="{{errorMsg}}" bind:retry="loadData" />
//
// props:
//   message  错误提示文字
//   icon     图标 emoji，默认 '⚠️'
//   retryText 重试按钮文字，默认 '重试'
//   showRetry 是否显示重试按钮，默认 true
//
// events:
//   retry  用户点击重试按钮时触发
Component({
  properties: {
    message: { type: String, value: '加载失败，请稍后重试' },
    icon: { type: String, value: '⚠️' },
    retryText: { type: String, value: '重试' },
    showRetry: { type: Boolean, value: true },
  },
  methods: {
    onRetry() {
      this.triggerEvent('retry');
    },
  },
});
