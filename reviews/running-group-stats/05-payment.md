# 05 支付接入设计：申请指南 + 开发细则 + 参考代码

> 项目：青沐生命科技微信小程序
> 本文档供：负责人（办理申请）+ 开发（按细则实现）。参考代码仅为文档内容，不直接入库，实现时以 02 文档 API 契约为骨架。
> **积分定位（已确认）：积分是纯内部虚拟激励，仅由系统内部计算发放与抵扣，不充值、不提现、不转赠、不与人民币双向兑换，不涉及任何实际结算交易。**

---

## 0. 先说结论（决定申请什么）

| 渠道 | 能否用在微信小程序内 | 结论 |
|---|---|---|
| 微信支付 | ✔ 唯一选择 | **必须申请**，本项目全部线上收款走它 |
| 支付宝支付 | ✘ 不能 | 微信与支付宝生态互相隔离，微信小程序内无法调起支付宝（包括内嵌 H5、二维码等变通方式均被支付协议限制）。**支付宝申请仅在未来做支付宝小程序 / 自有 App / 独立 H5 商城时才需要**，本文 §3 仍给出完整申请方法备用 |
| 积分 | — | 内部记账，不是支付渠道，见 §5 |

---

## 1. 微信支付申请（负责人办理清单）

### 1.1 前置条件
1. 小程序主体必须是**企业或个体工商户**（个人主体永远开不了支付）。
2. 小程序已完成**微信认证**（微信公众平台提交企业资料，认证费 300 元/年）。
3. 有**对公银行账户**（企业必须对公；个体工商户可用经营者银行卡）。账户名称必须与营业执照主体名称一致。

### 1.2 所需材料清单

| 材料 | 要求 |
|---|---|
| 营业执照 | 有效期内，照片/扫描件清晰，统一社会信用代码 |
| 法定代表人身份证 | 正反面照片；非法人办理另需经办人身份证+授权函 |
| 对公账户信息 | 开户行全称、开户支行、账号（用于打款验证） |
| 联系信息 | 经办人手机号、邮箱（接收审核通知） |
| 经营信息 | 商户简称（会显示在用户账单）、客服电话、经营类目、门店/网站/小程序截图 |
| 特殊类目资质 | 商城卖**食品/保健品**需《食品经营许可证》等；卖医疗器械需相应许可。青沐若上架健康食品，提前备好 |

### 1.3 申请步骤（线上全流程，约 1-5 个工作日）
1. 登录 [微信支付商户平台](https://pay.weixin.qq.com) → 「接入微信支付」→ 选择「小程序支付」场景进件。
2. 填写主体信息、上传材料 → 提交审核（1-2 个工作日）。
3. 审核通过后：**账户验证**（微信向对公账户打一笔随机金额，回填确认）+ 法人/经办人签约。
4. 拿到 **商户号（mch_id）** 后，在商户平台「产品中心 → AppID 账号管理」**绑定小程序 AppID**（wx426885831a05f18e），小程序管理员扫码确认授权。
5. 商户平台「API 安全」：设置 **APIv3 密钥**、下载/申请 **API 证书**（云开发 cloudPay 模式可跳过证书，见 §4.1）。
6. （本项目推荐）云开发控制台 →「微信支付」→ 绑定该商户号，之后云函数可免证书调用支付。

### 1.4 费率与到账
- 标准费率 **0.6%**（按经营类目 0.6%–1% 不等，民生类目可能更低）；T+1 自动结算到对公账户。
- 申请下来后：管理员把 `app_config.feature_flags.payment` 改为 `true`，前端无需发版即可放开支付（见 02 文档 §6）。

---

## 2. 支付宝申请（备用，未来多端使用）

> 再次强调：这些能力**用不到微信小程序里**，适用对象是未来的支付宝小程序、自有 App、独立 H5 商城、线下收款码。

### 2.1 所需材料
与微信支付高度一致：营业执照、法人身份证、对公账户（或个体户经营者支付宝账户）、经营类目说明、网站/App/小程序信息；食品类目同样需要许可证。另需一个**企业支付宝账户**（用营业执照注册，收款入账用）。

### 2.2 申请步骤
1. 注册 [支付宝开放平台](https://open.alipay.com) 开发者账号（用企业支付宝登录）→ 完成**企业实名认证**。
2. 开放平台控制台创建应用：未来做支付宝小程序则「创建小程序」；做 App/H5 则「创建网页/移动应用」，拿到 **APPID**。
3. 「产品绑定」按场景开通支付产品并签约（审核约 1-3 个工作日）：

| 产品 | 适用场景 |
|---|---|
| 小程序支付（JSAPI） | 支付宝小程序内收款 |
| 手机网站支付（WAP） | 独立 H5 商城 |
| APP 支付 | 自有 App |
| 当面付 | 线下扫码/收款码（活动现场收报名费可用） |

4. 配置密钥：开放平台「开发设置」生成 **应用公私钥（RSA2）**，上传应用公钥、保存支付宝公钥（或用证书模式）。
5. 费率：一般 **0.38%–0.6%**（当面付低、线上标准 0.6%，类目和活动期有浮动），T+1 结算。

### 2.3 本项目的建议
V1.x 阶段**不投入支付宝开发**；待商城在微信端验证跑通、确有多端需求（如线下马拉松现场收费）再启动，优先级排在 V2 之后。

---

## 3. 支付总体设计（两渠道统一抽象）

```
                 ┌────────────── pay 抽象层（云函数 wallet/pay） ──────────────┐
 业务方           │  createPayment(orderId, channel)   ← channel: wechat|alipay │
 mall 订单 ──────►│  统一订单状态机 / 幂等 / 金额校验（一律以「分」为单位整数）      │
 membership 会员──►│  回调统一入口 verify→记账→改单→发通知                        │
                 └──────┬──────────────────────────────┬───────────────────────┘
                        ▼ 现在实现                       ▼ 未来多端再实现
                  微信支付(cloudPay/APIv3)          支付宝 SDK(alipay-sdk)
```

**订单状态机**（orders.status，只允许如下迁移，其余一律拒绝）：

```
pending_pay ──支付成功回调──► paid ──发货──► shipped ──确认──► done
     │                        │
     └──超时30min/用户取消──► cancelled   └──退款──► refunding ──► refunded
```

开发细则（两渠道通用，逐条验收）：
1. **金额**：全链路用整数「分」，禁止浮点；客户端传来的金额只作展示，**服务端按商品表现价重算**，不一致即拒单。
2. **幂等**：`outTradeNo = 订单ID`，回调按 outTradeNo 加锁处理；重复回调直接返回成功不重复记账。
3. **验签**：回调必须验签（cloudPay 模式由平台代验：仅信任云开发投递的回调；APIv3 模式验证 Wechatpay-Signature 头）。**严禁以前端回报的"支付成功"作为发货依据**，唯一依据是服务端回调/主动查单。
4. **超时**：下单时记 expireAt=30min，定时函数将过期 pending_pay 置 cancelled 并释放库存。
5. **对账**：每日定时函数拉取账单（cloudPay downloadBill / 支付宝对账单接口），与 orders 比对，差异写告警表。
6. **退款**：仅管理员白名单可发起，按原路退回，记 refund 流水，先退积分抵扣部分→再退现金部分。
7. **日志**：支付链路每一步落 pay_logs 集合（脱敏，不存证书/密钥）。

---

## 4. 微信支付参考代码（云开发 cloudPay 方案，本项目首选）

> 选 cloudPay 的理由：免 API 证书、免回调域名备案、回调直接投递到指定云函数，最适合云开发架构。若未来迁出云开发，再换 APIv3 直连（§4.4）。

### 4.1 下单（云函数 wallet，action=unifiedOrder）

```js
// cloudfunctions/wallet/pay.js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function unifiedOrder({ OPENID, payload }) {
  const { orderId } = payload
  const flags = (await db.collection('app_config').doc('feature_flags').get()).data
  if (!flags.payment) throw { code: 403, message: '支付功能开通中' }

  const order = (await db.collection('orders').doc(orderId).get()).data
  if (order._openid !== OPENID) throw { code: 403, message: '无权操作' }
  if (order.status !== 'pending_pay') throw { code: 409, message: '订单状态不可支付' }

  // 服务端重算金额（分），绝不信任前端
  const payAmount = await recalcAmount(order)   // 商品现价×数量 - 积分抵扣
  if (payAmount !== order.payAmount) throw { code: 409, message: '价格已变动，请重新下单' }

  const res = await cloud.cloudPay.unifiedOrder({
    body: '青沐商城-订单' + orderId.slice(-6),
    outTradeNo: orderId,                  // 幂等键
    spbillCreateIp: '127.0.0.1',
    subMchId: process.env.MCH_ID,         // 商户号放环境变量，不写死
    totalFee: payAmount,                  // 单位：分
    envId: cloud.DYNAMIC_CURRENT_ENV,
    functionName: 'payCallback'           // 回调云函数
  })
  return res.payment                       // 含 timeStamp/nonceStr/package/paySign
}
```

### 4.2 支付回调（云函数 payCallback，唯一记账入口）

```js
// cloudfunctions/payCallback/index.js
exports.main = async (event) => {
  // cloudPay 投递的 event 含 returnCode/resultCode/outTradeNo/totalFee/transactionId
  if (event.returnCode !== 'SUCCESS' || event.resultCode !== 'SUCCESS')
    return { errcode: 0, errmsg: 'OK' }            // 失败回调也要应答，避免重投

  const orderId = event.outTradeNo
  await db.runTransaction(async t => {
    const order = (await t.collection('orders').doc(orderId).get()).data
    if (order.status === 'paid') return            // 幂等：重复回调直接放过
    if (order.status !== 'pending_pay') throw new Error('状态异常')
    if (event.totalFee !== order.payAmount) throw new Error('金额不符')  // 防篡改

    await t.collection('orders').doc(orderId).update({ data: {
      status: 'paid',
      payment: { transactionId: event.transactionId, paidAt: new Date() }
    }})
    await t.collection('wallet_transactions').add({ data: {
      _openid: order._openid, type: 'consume', amount: event.totalFee,
      orderId, wxTransactionId: event.transactionId, status: 'success', createdAt: new Date()
    }})
  })
  // 会员订单：在此处写 memberLevel/memberExpireAt（服务端唯一入口）
  return { errcode: 0, errmsg: 'OK' }              // 必须按此格式应答
}
```

### 4.3 前端调起（services/wallet.js + 页面）

```js
// services/wallet.js
import { call } from './api'
export async function payOrder(orderId) {
  const payment = await call('wallet', 'unifiedOrder', { orderId })
  await wx.requestPayment(payment)        // 用户输密码/指纹
  // 注意：requestPayment 成功 ≠ 入账成功，最终状态以轮询订单为准
  return pollOrderStatus(orderId)          // 轮询 3 次×2s 查 orders.status === 'paid'
}
```

### 4.4 备选：APIv3 直连要点（迁出云开发时再用）
商户平台下载证书 + 设置 APIv3 密钥 → 服务端用官方 SDK（如 wechatpay-node-v3）调 `JSAPI 下单` 接口拿 prepay_id → 自行用商户私钥生成 paySign 返回前端 → 回调接口验证 `Wechatpay-Signature` + AES-256-GCM 解密报文。其余状态机/幂等/对账细则与 §3 完全一致。

### 4.5 支付宝参考代码骨架（未来 H5/支付宝小程序用）

```js
// 服务端（Node）：alipay-sdk
const AlipaySdk = require('alipay-sdk').default
const alipay = new AlipaySdk({ appId, privateKey, alipayPublicKey })
// 下单（H5 手机网站支付）
const url = alipay.pageExec('alipay.trade.wap.pay', {
  bizContent: { out_trade_no: orderId, total_amount: '29.90',
                subject: '青沐商城订单', product_code: 'QUICK_WAP_WAY' },
  notify_url: 'https://api.xxx.com/alipay/notify'
})
// 回调：alipay.checkNotifySign(postData) 验签 → 同 §4.2 的幂等记账逻辑
```

---

## 5. 积分规则（内部计算，零结算风险）

**定性**：积分是运营激励工具，等同"虚拟勋章+优惠抵扣额度"，不是预付卡、不是虚拟货币。守住四条合规红线：

1. **只进不提**：积分可获得、可抵扣（最多抵订单的 X%，建议 50%，或全额兑换指定"积分专区"商品），**不可充值购买、不可提现、不可转赠、不可兑换现金**。
2. **单向折算**：仅在抵扣瞬间按固定比率折算（如 100 积分 = 1 元抵扣额），系统内不存在"人民币→积分"的购买通道（会员月赠积分是权益赠送，不是购买）。
3. **服务端唯一记账**：发放/扣减只发生在云函数（打卡、注册、月赠、订单抵扣、退款返还），全部写 `points_records` 流水（02 文档 §4），余额用 `inc` 原子变更；前端任何积分参数一律忽略。
4. **可审计、可过期**：每笔流水含 type/refId/变更后余额；建议积分 24 个月滚动过期（提前 30 天订阅消息提醒），过期也走流水（type:'expire'）。

发放规则（读 app_config.points_rules，运营可调）：

| 行为 | 积分 | 防滥用 |
|---|---|---|
| 注册 | +50 | 一次性 |
| 每日打卡 | +1/km，单日上限 50 | 每日仅 1 次计分（02 §5.3） |
| 会员月赠 | 月100/季150/年200 | 定时函数发放，伴随会员有效期 |
| 订单抵扣 | −100/元 | 抵扣上限 50%；退款时原路返还积分 |

---

## 6. 落地时间线（并入 04 文档 Phase 4）

| 步骤 | 责任人 | 耗时 |
|---|---|---|
| 备齐 §1.2 材料 + 商户平台进件 | 负责人 | 0.5 天（审核 1-5 工作日） |
| 打款验证 + 签约 + 绑定 AppID + 云开发绑定商户号 | 负责人+开发 | 0.5 天 |
| wallet 云函数（unifiedOrder + payCallback + 查单/关单/退款） | 开发 | 2 天 |
| 订单超时关单 + 每日对账定时函数 | 开发 | 1 天 |
| 会员购买接支付 + 开关切换回归（02 §5.4 双态） | 开发 | 1.5 天 |
| 沙箱/小额真实支付全链路验收（含重复回调、金额篡改用例） | 开发+负责人 | 0.5 天 |

**Sources:**
- [微信支付商户平台 · 小程序接入指引](https://pay.weixin.qq.com/static/applyment_guide/applyment_detail_miniapp.shtml)
- [微信支付商户开户意愿指引](https://pay.weixin.qq.com/static/help_guide/business_registration.shtml)
- [CloudPay.unifiedOrder 官方文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/reference-sdk-api/open/pay/CloudPay.unifiedOrder.html)
- [腾讯云开发：云函数接入微信支付实践](https://docs.cloudbase.net/en/practices/use-wechat-pay)
- [支付宝开放平台](https://open.alipay.com/) · [支付宝小程序接入准备](https://opendocs.alipay.com/open/204/105297/)
- [微信开放社区：小程序能否使用支付宝支付](https://developers.weixin.qq.com/community/develop/doc/000006c39d852839ed8be49f05bc00)
