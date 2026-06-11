# 04 开发任务拆解

> 项目：青沐生命科技微信小程序重构
> 用法：按 Phase 顺序执行；每条任务含验收标准（AC），完成即勾选。工作量单位：人天（1 名熟悉小程序的开发）。
> 依赖文档：01 审查报告（问题编号 P0-x/P1-x 对应）、02 架构（§ 引用）、03 原型。
> 总量估算：V1.0 约 **28–35 人天**（不含 UI 切图与商品/内容素材准备）。

---

## Phase 0 地基修复（约 3 天）—— 不做完不允许开发任何业务

| ID | 任务 | 对应问题 | 工作量 | 验收标准 (AC) |
|---|---|---|---|---|
| T0-1 | 创建 sitemap.json；app.json 删除 `"debug": true` | P0-7 | 0.5 | 开发者工具编译 0 报错 0 警告（资源类除外） |
| T0-2 | 开通/确认云开发环境，`app.js` 填真实 env ID；删除无用 baseUrl | P0-7 | 0.5 | 任一云函数可调通并返回 |
| T0-3 | 每个云函数补 package.json（wx-server-sdk），init 统一 `DYNAMIC_CURRENT_ENV` | P0-7 | 0.5 | 全部云函数可一键部署成功 |
| T0-4 | 新增 .gitignore（project.private.config.json/.DS_Store/node_modules），并从 git 移除已入库文件 | P2-5 | 0.5 | git status 干净 |
| T0-5 | 建 `services/api.js` 统一封装（action 路由、loading、错误 toast、code 约定见 02 §7） | P2-3 | 1 | 任意页面 3 行代码完成一次云函数调用并自动处理错误 |
| T0-6 | 建 `app_config` 集合 + feature_flags 文档 + `components/feature-gate` 组件 | 02 §4 | 1 | 改库里 wallet=false，钱包入口即消失（无需发版） |

## Phase 1 身份与用户（约 4 天）

| ID | 任务 | 对应 | 工作量 | AC |
|---|---|---|---|---|
| T1-1 | `user` 云函数：login（getWXContext 取 openid，首登建档+注册积分）、updateProfile、字段白名单 | P0-2/3/4，02 §5.1 | 1.5 | ① event 传入伪造 openid 不生效 ② 新用户首登 users 集合自动建档 ③ 全库无 'test_openid' 写入 |
| T1-2 | 前端 `utils/auth.js`：ensureLogin、登录态缓存、游客模式拦截 | 02 §5.1 | 1 | 游客可浏览；点打卡/下单弹出完善资料流程 |
| T1-3 | 资料弹窗组件：chooseAvatar + nickname 新接口；**删除全部 getUserProfile/getUserInfo** | P0-4 | 1 | 真机可设置头像昵称；代码 grep 无废弃 API |
| T1-4 | profile 页改造：picker/表单页编辑，对接 user.updateProfile；实名认证入口隐藏 | 03 §4.8 | 0.5 | 各字段可编辑保存、刷新后仍在 |
| T1-5 | mine 页（settings 改名）：真实数据头部、退出登录改 reLaunch、客服改 open-type="contact" | P1-7/8 | 0.5 | 退出后回首页游客态；数据来自接口 |

## Phase 2 运动闭环（约 8 天）★ 产品核心

| ID | 任务 | 对应 | 工作量 | AC |
|---|---|---|---|---|
| T2-1 | `sport.checkin`：服务端校验（0.5–50km、当日 1 次计分）、算积分、写 checkins + points_records、inc users.points/stats | P1-1/2，02 §5.3 | 1.5 | ① 传 points 字段被忽略 ② 距离 -1/999 被拒 ③ 当日第 2 次打卡不加分 |
| T2-2 | sport 页（group 改名重做）：打卡表单（时长→自动配速）、今日已打卡态、我的群列表；**删除 setInterval/发送汇总/假成员** | P0-6，P1-3，03 §4.2 | 1.5 | 打卡后立即见积分增长；页面无任何写死人名 |
| T2-3 | `sport.createGroup/joinGroup/quitGroup`：上限按 app_config.member_levels；shareAppMessage 邀请卡；群聊场景 getGroupEnterInfo 绑定 opengid | 02 §5.2 | 2 | 两个真机账号可建群、经卡片入群；超上限被拦截并提示升级会员 |
| T2-4 | group-detail 页：周/月/年榜（sport.groupRanking 聚合）、成员管理（群主） | 03 §4.3 | 1.5 | 榜单数字与 checkins 手工核对一致 |
| T2-5 | 周报：定时触发器聚合 group_reports + 订阅消息推送 + 战报分享图（canvas 含小程序码） | 02 §5.2，03 §6 | 1.5 | 周日 20:00 收到订阅消息；战报图可保存转发 |
| T2-6 | index 首页数据化：myStats 概览、公告条、活动位读 contents；移除启动定位 | P1-5/8，03 §4.1 | 1 | 首页无硬编码数字；启动不再弹定位授权 |

## Phase 3 商城与内容（约 8 天）

| ID | 任务 | 对应 | 工作量 | AC |
|---|---|---|---|---|
| T3-1 | products 集合 + `admin.upsertProduct`（openid 白名单）+ 商品图传云存储 | 02 §4/§7 | 1 | 管理员可增改商品并即时生效 |
| T3-2 | mall 页（statistics 改名重做）：分类/搜索/列表分页（mall.listProducts） | 03 §4.4 | 1.5 | 8 个 mock 商品删除；搜索分类可用 |
| T3-3 | product-detail 独立页（拆 528 行 wxml） | P2-6 | 1 | 详情页可分享、可加购 |
| T3-4 | 购物车（本地 storage）+ order-confirm + `mall.createOrder`（积分抵扣，payment=OFF 双态逻辑见 02 §5.4） | 03 §3.3 | 2 | ① 积分足额可 0 元兑换成功且服务端扣分 ② 不足时显示"支付开通中"意向单 |
| T3-5 | order-list 我的订单 + cancelOrder | 02 §7 | 0.5 | 订单状态流转正确 |
| T3-6 | contents 集合 + content-list/content-detail 五合一模板页；**删除 marathon/hotel/food/scenic/rural-support/marathon-expo 六个旧页**及其对不存在云函数的调用 | P0-5，03 §4.7 | 2 | 五类内容同一套页面渲染；报名意向落 enrollments 表 |

## Phase 4 支付与钱包（约 5 天，前置条件：商户号审批通过）

| ID | 任务 | 前置 | 工作量 | AC |
|---|---|---|---|---|
| T4-1 | 商户号关联 AppID + 云开发绑定（负责人办理，见 02 §6） | 营业执照 | — | cloudPay 沙箱可下单 |
| T4-2 | `wallet.unifiedOrder` + 支付回调验签 + 订单置 paid + 流水落库；**重写 save/get-wallet-data，余额禁止客户端写**（删除现有实现） | P0-1 | 2 | 篡改回调/伪造金额被拒；账实一致 |
| T4-3 | membership 页 + 会员购买支付化，**删除 settings.js 写 storage 的假购买**；服务端写 memberLevel/到期/月赠积分定时任务 | P0-4 相关 | 1.5 | 购买后等级、群上限、商城折扣即时生效；到期自动降级 |
| T4-4 | 打开 payment/wallet/membershipPurchase 开关，回归测试 3.3 双态 | T4-2/3 | 1 | 开关 ON/OFF 两态均通过验收用例 |
| T4-5 | 钱包页重做：余额只读 + 流水分页；删除"绑定支付宝/银行卡"假 UI | P1-6，03 §4.6 | 0.5 | 流水来自 wallet_transactions 集合 |

## Phase 5 收尾与上线（约 3 天）

| ID | 任务 | 工作量 | AC |
|---|---|---|---|
| T5-1 | 品牌换色 + tabBar 图标 + emoji→iconfont + 空态/加载组件统一 | 1 | 设计走查通过 |
| T5-2 | 隐私协议弹窗 + 用户协议/隐私政策页 + 小程序后台类目与资质（食品类目）| 0.5 | 审核要求项齐备 |
| T5-3 | 数据库权限复查：所有集合「仅云函数可写」；admin 白名单配置 | 0.5 | 控制台直接写库被拒 |
| T5-4 | 删除遗留：smart-agent 页面与云函数、ai-robot、get-group-data、send-summary（被 T2-5 替代）、save-user-location、全部 console.log | 0.5 | grep 无 console.log；云函数仅剩 02 §7 的 6 个 |
| T5-5 | 体验版全流程回归（用例：游客浏览/注册/打卡/建群入群/榜单/兑换/意向单/退出）+ 提审 | 0.5 | 用例全过，提审通过 |

---

## 里程碑与并行建议

```
周1      周2        周3        周4        周5(等商户号)
Phase0─►Phase1 ─► Phase2 ──────► Phase3 ─► Phase4 ─► Phase5上线
         └ 前后端可并行：A同学做云函数(T1-1,T2-1,T2-3)，B同学做页面(T1-2~5,T2-2)
Phase4 与 Phase3 之间无强依赖，商户号何时下来何时插入。
```

## 风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| 商户号审批延期 | 会员/支付收入延后 | V1.0 以积分兑换 + 意向单先行，不阻塞上线 |
| 群聊场景 opengid 需用户授权且仅群聊打开有效 | 群绑定体验有门槛 | 兜底"邀请码入群"路径（T2-3 已含） |
| 订阅消息一次性授权限制 | 周报触达率低 | 打卡成功页顺势请求订阅授权；战报图转发兜底 |
| 食品类商品资质 | 商城审核被拒 | 提前在后台开通类目并备齐资质（T5-2 前置办理） |
| 旧体验版已有测试数据 | 脏数据混入 | 上线前清空 checkins/users 等集合 |
