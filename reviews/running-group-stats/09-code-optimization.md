# 09 代码优化清单（重扫）

> 项目：青沐生命科技微信小程序
> 重扫日期：2026-06-11　|　视角：**优化**（性能 / 包体 / 可维护性 / 代码去重），区别于 01 号文档的「缺陷审查」。
> 重扫结论：自上次审查以来代码**无实质变化**（仍 15 页面 / 13 云函数；`sitemap.json`、云函数 `package.json` 仍缺失；新增一个空 `images/` 目录与 `smart-agent.wxss`）。故 01/04 号文档结论依旧有效。本文在其基础上，给出**纯优化向**的可直接落地改法（含 before/after），不重复罗列已知缺陷。

> ⚠️ 优先级提示：本项目正按 02 号文档做架构重构。**重构会重写大部分页面**，因此本文的优化项分两类标注：
> ◆ **[重构顺带做]**——在重写该模块时一并采用，无需单独排期；
> ○ **[独立可做]**——即使不重构也值得现在改，投入小见效快。

---

## 0. 优化机会总览（按收益/成本排序）

| # | 优化项 | 类型 | 收益 | 成本 | 标注 |
|---|---|---|---|---|---|
| O-1 | 6 个雷同"列表+预订"页合并为模板页 | 代码去重 | 删约 600 行重复代码 | 中 | ◆ |
| O-2 | callFunction 统一封装（现散落 11 文件 17 处） | 可维护性 | 改一处生效全局 | 中 | ◆ |
| O-3 | group.js 拆分（657 行 / 17 次 setData / 3 职责） | 性能+可维护 | 首屏快、易维护 | 中 | ◆ |
| O-4 | setData 瘦身（只传变化字段、大列表分页） | 运行性能 | 渲染卡顿↓ | 小 | ○ |
| O-5 | 分包加载（subPackages） | 启动性能 | 主包体积↓、首开快 | 小 | ○ |
| O-6 | app.wxss 3565 行拆分 + 设计变量 | 可维护性 | 样式可控、改色一处 | 中 | ◆ |
| O-7 | mock 数据移出 data（31 处硬编码） | 可维护性 | data 轻、逻辑清晰 | 小 | ◆ |
| O-8 | 公共逻辑抽 utils（会员等级/格式化/openid） | 代码去重 | 消除多处重复 | 小 | ◆ |
| O-9 | 长列表 wx:key 与渲染优化 | 渲染性能 | 列表滚动流畅 | 小 | ○ |
| O-10 | 资源与构建（图片、debug、console.log） | 包体+规范 | 体积↓、上线就绪 | 小 | ○ |

---

## 1. O-1 雷同页面合并（最大收益）◆

**现状**：`food / scenic / hotel / marathon / marathon-expo / rural-support` 六个页面结构 95% 相同——都是「`data` 里塞一个硬编码数组 + `loadX()` 空壳 + `registerX/bookX/orderX/buyX()` 弹确认框 + `saveX()` 调用一个**不存在**的云函数」。仅 `food.js` 就调 `save-food-order`（又一个不存在的云函数，与 01 文档 P0-5 同类）。

六页 `.js` 合计约 700 行，去重后一个模板页约 120 行，**净删约 600 行**。

**before（每页一份，six times）**：
```js
// pages/food/food.js —— 和 hotel/scenic/marathon… 仅字段名不同
Page({
  data: { foods: [ {id:1,name:'全聚德烤鸭',price:198,...}, /* 5条硬编码 */ ] },
  onLoad(){ this.loadFoods() },
  loadFoods(){ console.log('加载餐饮列表') },           // 空壳
  orderFood(e){ /* showModal → setTimeout → saveOrder → Toast */ },
  saveOrder(food){ wx.cloud.callFunction({ name:'save-food-order', /* 不存在 */ }) }
})
```

**after（一个模板页，按 type 驱动；对接 02 文档 content 云函数）**：
```js
// pages/content-list/content-list.js
import { content } from '../../services/index'
Page({
  data: { type: '', list: [], loading: true },
  async onLoad({ type }) {                              // type=food|scenic|hotel|marathon|...
    wx.setNavigationBarTitle({ title: TYPE_TITLE[type] })
    this.setData({ type, list: await content.list({ type }), loading: false })
  },
  async onEnroll(e) {                                   // 统一"报名/预订意向"
    const id = e.currentTarget.dataset.id
    await content.enroll({ id })                        // 走真实云函数，登记意向
    wx.showToast({ title: '已提交，工作人员将联系您' })
  }
})
```
配 `content-list.wxml` 一套模板 + `app.json` 用 `?type=` 传参（首页宫格已是 `goToMarathon/goToHotel…`，改成统一跳转即可）。**6 个 .js + 6 个 .wxml → 2 个文件**。

---

## 2. O-2 callFunction 统一封装 ◆

**现状**：`wx.cloud.callFunction` 散落 **11 个文件、17 处**，每处各写一套 `success/fail` + `console.log` + `userInfo.openId || 'test_openid'`，风格还混用回调与 async/await。改个超时、加个全局 loading、统一错误提示都得改 17 处。

**after（services 层，全项目唯一出口）**：
```js
// services/api.js
const app = getApp()
export function call(name, action, payload = {}, { loading = true } = {}) {
  loading && wx.showLoading({ title: '加载中', mask: true })
  return wx.cloud.callFunction({ name, data: { action, payload } })
    .then(res => {
      const r = res.result
      if (r.code !== 0) throw r                          // 统一错误约定
      return r.data
    })
    .catch(err => { wx.showToast({ title: err.msg || '网络异常', icon: 'none' }); throw err })
    .finally(() => loading && wx.hideLoading())
}
// services/index.js —— 领域封装
export const content = {
  list:   p => call('content', 'list', p),
  enroll: p => call('content', 'enroll', p),
}
export const sport = { checkin: p => call('sport', 'checkin', p), /* … */ }
```
页面侧从十几行回调塌缩成一行 `await sport.checkin({...})`。openid 永不在前端出现（02 文档 P0-2）。

---

## 3. O-3 group.js 拆分 ◆

**现状**：`group.js` **657 行、17 次 setData**，一页混了三件事：跑群绑定、打卡、周/月/年汇总展示，且含 4 大段硬编码 mock（成员、周/月/年 summary）。是全项目最重的页面。

**改法**（与 02 文档目录一致）：
- 拆成 `sport`（打卡 + 我的群列表）+ `group-detail`（榜单/汇总），各自约 150 行。
- 三段 summary mock 删除，改 `sport.groupRanking({period})` 服务端聚合。
- `showWeekSummary/showMonthSummary/showYearSummary` 三个几乎一样的函数 → 一个 `loadRanking(period)`。

**before**：
```js
showWeekSummary(){ this.setData({ currentSummary: {/*硬编码周*/}, summaryPeriod:'…' }) }
showMonthSummary(){ this.setData({ currentSummary: {/*硬编码月*/}, summaryPeriod:'…' }) }
showYearSummary(){ this.setData({ currentSummary: {/*硬编码年*/}, summaryPeriod:'…' }) }
```
**after**：
```js
async loadRanking(e){
  const period = e.currentTarget.dataset.period          // week|month|year
  this.setData({ currentSummary: await sport.groupRanking({ groupId: this.data.groupId, period }) })
}
```

---

## 4. O-4 setData 瘦身 ○（不重构也该改）

微信 setData 是逻辑层→渲染层跨线程通信，**传得越大越频繁越卡**。两条通用规则：

1. **只传变化的字段，别整对象覆盖**。
   - before：`this.setData({ paymentMethods })`（钱包页整个对象回写）
   - after：`this.setData({ ['paymentMethods.wechat']: true })`（路径更新，只传变化项）
2. **大列表不要一次性灌进 data**。商城 `statistics.js` 一次塞 8 条带长 `description` 的商品；真实数据应分页 `concat` 追加，配合 `onReachBottom`。
3. **避免在循环里 setData**；先聚合成一个对象再一次性 set。

---

## 5. O-5 分包加载 ○

**现状**：`app.json` 15 个页面全在主包。商城详情、内容五页、智能体等首开用不到，却都算进主包体积，拖慢冷启动。

**after**：
```jsonc
// app.json
{
  "pages": ["pages/index/index","pages/sport/sport","pages/mall/mall","pages/mine/mine"],
  "subpackages": [
    { "root": "pkg-content", "pages": ["content-list/content-list","content-detail/content-detail"] },
    { "root": "pkg-mall",    "pages": ["product-detail/product-detail","order-confirm/order-confirm"] }
  ],
  "preloadRule": { "pages/index/index": { "packages": ["pkg-content"] } }  // 首页空闲时预载
}
```
主包只留 4 个 tab 页，其余按需加载 + 预载，冷启动更快。

---

## 6. O-6 app.wxss 拆分 + 设计变量 ◆

**现状**：`app.wxss` **3565 行、545 条 class** 全在全局，主色硬编码微信绿 `#1aad19`（非青沐品牌色），改色要全局搜替换。

**after**：
```css
/* app.wxss 顶部：设计令牌，约束在 300 行内只放通用类 */
page {
  --brand: #0FAF8E; --brand-dark: #0B8C72; --brand-bg: #E6F7F3;
  --text-1: #1f2937; --text-2: #6b7280; --radius: 12rpx;
}
.btn-primary { background: var(--brand); color:#fff; border-radius: var(--radius); }
```
- 页面专属样式下沉到各自 `pages/x/x.wxss`；全局只留 token + 通用类。
- 改品牌色从"全局替换 #1aad19"变成"改一个变量"。

---

## 7. O-7 ~ O-10 其余优化（小成本）

**O-7 mock 移出 data** ◆：`group/statistics/food/hotel/marathon/scenic/...` 共 31 处硬编码业务字段堆在 `data`，使初始 `data` 臃肿且与真实数据混淆。重构期一律改为接口拉取；过渡期可暂存 `constants.js`。

**O-8 公共逻辑抽 utils** ◆：
- 会员等级→权益映射在 `group.js` 和 `settings.js` 各写一份（01 文档 P1-9），抽 `utils/member.js` 单一来源。
- 配速/距离/日期格式化散落多页 → `utils/format.js`。
- `userInfo.openId || 'test_openid'` 14 处 → 随 O-2 一并消除。

**O-9 列表渲染** ○：`wx:for` 用稳定业务 id 作 `wx:key`（现多处用 `index`，数据变动会整列重渲）；长内容列表配合 O-4 分页。

**O-10 资源与构建** ○：
- `app.json` 删 `"debug": true`；补 `sitemap.json`（否则构建告警）。
- 全量删除 `console.log`（40+ 处）；云函数保留 `console.error`。
- 空 `images/` 目录补 tabBar 图标或删除；emoji 图标换切图（跨机型渲染不一致）。
- 补 `.gitignore`（`project.private.config.json`、`.DS_Store`、`node_modules/`）。

---

## 8. 落地建议

1. **不要为优化单独重写**：◆ 项随 02/04 文档的模块重构顺带完成，**不额外排期**。
2. **现在就能做的 ○ 项**（O-4/O-5/O-9/O-10）投入小、与重构不冲突，可作为重构前的"热身 PR"，约 1-1.5 人天。
3. 验收：主包体积下降（可在开发者工具"代码依赖分析"看）、首页冷启动时间下降、`grep -r "callFunction" pages` 仅命中 services 层、`grep -rn "console.log\|test_openid"` 归零。

> 配套：本目录 `01-code-review.md`（缺陷）、`02-architecture.md`（目标结构）、`04-task-breakdown.md`（任务表）。本文 ◆ 项已隐含在 04 的 Phase 1-3，○ 项可并入 Phase 0。
