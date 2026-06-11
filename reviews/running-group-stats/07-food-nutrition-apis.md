# 07 国内菜谱与饮食营养 API 选型

> 项目：青沐生命科技微信小程序
> 用途：为「餐饮/健康饮食」模块（03 文档 content type=food）和未来"运动 + 饮食管理"闭环提供数据源。本文盘点国内可用的菜谱/营养/识别类 API，给出选型建议、缓存落地设计与参考代码。

---

## 1. 业务场景 → 需要什么 API

| 产品场景 | 需要的能力 | 对应 §2 分类 |
|---|---|---|
| 食谱内容（跑前/跑后怎么吃、健康食谱推荐） | 菜谱大全（菜名、食材、步骤、图片） | A 菜谱内容 |
| 食物热量/营养查询（"一碗米饭多少大卡"） | 营养成分数据库 | B 营养成分 |
| 拍照识别菜品记饮食（进阶玩法） | AI 菜品图像识别 | C AI 识别 |
| 扫包装条码看配料/热量 | 条码→商品/配料 | D 条码查询 |
| 专业营养内容/品牌联名 | 内容商务合作 | E 合作通道 |

## 2. 国内可用 API 盘点

### A. 菜谱内容 API（按成熟度排序）

| 平台 | 数据规模 | 能力 | 计费 |
|---|---|---|---|
| [聚合数据·菜谱大全](https://www.juhe.cn/docs/api/id/46) | 10 万+ 道，按蛋/奶/面/蔬果/肉/水产等分类 | 关键词/分类查询，含图文步骤 | 免费额度 + 按次付费 |
| [极速数据·菜谱](https://www.jisuapi.com/api/recipe/) | 1 万+ 道 | 分类树、关键词搜索、主料辅料、做法步骤 | 免费额度 + 套餐 |
| [天行数据 TianAPI·菜谱查询](https://www.tianapi.com/apiview/23) | 数万道 | 随机菜谱、按分类检索 | 会员套餐制，单价低 |
| 免费 API 聚合站（free-api 等收录的菜谱接口） | 不稳定 | 仅原型期临时用 | 免费 |

> 三家正规商用平台（聚合/极速/天行）均为标准 HTTPS+JSON、需注册企业账号申请 AppKey。**菜谱属于内容数据，注意版权条款**——选购时确认"允许商用展示"，页面保留来源标注。

### B. 食物营养成分 / 热量 API

| 平台 | 数据规模 | 能力 |
|---|---|---|
| [天行·营养成分表](https://www.tianapi.com/apiview/121) | 约 2000 种常见食物 | 每 100g 营养成分与微量元素、按成分排序检索 |
| RollTools 等食物热量 API | 数千种 | 食物分类/列表/搜索/详情四接口 |
| 《中国食物成分表》（标准版/全国代表值） | 权威纸质/数据授权 | 无公开 API；可购买数据授权后**自建库**（量大且需权威性时的正解） |
| 薄荷健康食物库 | 50 万+ 种（含包装食品） | 国内最全，但**无公开 API**，走 E 类商务合作 |
| FatSecret API（国际） | 全球库，有中文数据 | OAuth 接入，免费层可用；国内访问稳定性与合规需评估 |

### C. AI 菜品/食材识别

| 平台 | 能力 | 说明 |
|---|---|---|
| [百度 AI·菜品识别](https://ai.baidu.com/tech/imagerecognition/dish) | 识别 9000+ 菜品，返回菜名、置信度、**卡路里**、百科信息；支持自建菜品图库 | 国内最成熟，有免费测试额度，之后次数包/按量付费；接口 `image-classify/v2/dish` |
| [天行·食物营养识别](https://www.tianapi.com/apiview/248) | 传图识别近 2000 种食物并返回营养成分 | 识别+营养一步到位，规模小于百度 |
| 腾讯云/阿里云通用图像识别 | 通用标签含菜品类目 | 无专门菜品接口，准确率不如百度专项 |

### D. 食品条码查询

- 聚合数据、阿里云云市场等有「商品条码查询」API（条码→商品名/厂商/规格，部分含配料表）；数据完整度参差，**包装食品营养以实拍营养成分表为准**，条码 API 只做辅助填充。

### E. 内容/数据商务合作（API 之外的正路）

- **薄荷健康**：50 万食物库 + 营养师内容，国内健康饮食数据第一梯队，走商务授权（青沐"生命科技"定位与其调性契合，建议接洽）。
- **下厨房 / 豆果美食**：菜谱内容头部，无公开自助 API，内容授权/联合运营需商务谈。
- **中国营养学会**：权威膳食指南内容授权，适合做"科学背书"型内容。

## 3. 选型建议（结合本项目）

1. **V1（content food 模块上线即用）**：不接 API。食谱/饮食内容由运营在 `contents`(type=food) 录入 10-30 篇精选图文（跑者餐单、赛前碳水攻略），成本为零、可控、无版权风险。
2. **V2（饮食查询功能）**：接**一家**菜谱 API（推荐聚合数据，规模最大）+ **天行营养成分表**（热量查询），均经云函数代理并缓存（§4），月成本预计百元级。
3. **V2.5（拍照记饮食，差异化亮点）**：百度菜品识别 + 营养库联动——拍照→菜名+卡路里→写入用户饮食日记，与运动消耗对比形成"摄入 vs 消耗"闭环（大健康产品的核心粘性功能）。
4. **V3（数据自主化）**：若饮食功能被验证为核心，购买《中国食物成分表》数据授权自建营养库 + 接洽薄荷健康，摆脱按次计费与第三方依赖。

## 4. 落地设计：云函数代理 + 缓存（控制成本的关键）

```
小程序 ──► content 云函数(action=foodSearch) ──► ① 查 food_cache 集合命中即返回
                                              └─ ② 未命中→调第三方API→写缓存→返回
```

- 第三方 API 按次计费，**绝不允许小程序直连**（AppKey 会泄漏，也无法缓存）。AppKey 存云函数环境变量。
- 缓存集合 `food_cache`：`{ keyword, source:'juhe|tianapi|baidu', payload, hitCount, expiredAt }`，菜谱类缓存 30 天、营养成分缓存 180 天（基本不变）、识别结果按图片 hash 缓存。
- 限流：每用户每日查询/识别次数上限（如 20 次）写在 app_config，防止恶意刷量刷爆 API 账单。

参考代码（content 云函数新增两个 action）：

```js
// foodNutrition：营养成分查询（带缓存）
async function foodNutrition({ payload }) {
  const { keyword } = payload
  const hit = await db.collection('food_cache')
    .where({ keyword, source: 'tianapi', expiredAt: _.gt(Date.now()) }).get()
  if (hit.data.length) return hit.data[0].payload

  const res = await axios.get('https://apis.tianapi.com/nutrient/index', {
    params: { key: process.env.TIANAPI_KEY, word: keyword }
  })
  if (res.data.code !== 200) throw { code: 502, message: '营养库查询失败' }
  await db.collection('food_cache').add({ data: {
    keyword, source: 'tianapi', payload: res.data.result,
    expiredAt: Date.now() + 180 * 864e5, createdAt: new Date()
  }})
  return res.data.result
}

// dishRecognize：百度菜品识别（图片先传云存储，云函数取临时链接转 base64）
async function dishRecognize({ OPENID, payload }) {
  await checkDailyQuota(OPENID, 'dishRecognize', 20)          // 限流
  const token = await getBaiduToken()                          // access_token 缓存30天
  const res = await axios.post(
    'https://aip.baidubce.com/rest/2.0/image-classify/v2/dish',
    qs.stringify({ image: payload.imageBase64, top_num: 3 }),
    { params: { access_token: token } })
  const best = res.data.result?.[0]
  if (!best) throw { code: 404, message: '未识别出菜品' }
  return { name: best.name, calorie: best.calorie, probability: best.probability }
}
```

## 5. 任务与风险

| 任务 | 工作量 | 验收 |
|---|---|---|
| T7-1 V2：聚合菜谱 + 天行营养接入（云函数代理+缓存+限流） | 2 天 | 同一关键词第二次查询不产生外部调用 |
| T7-2 V2：food 页加"热量查询"入口 | 1 天 | 查询"米饭"返回每100g营养成分 |
| T7-3 V2.5：百度菜品识别 + 饮食日记（meals 集合）+ 摄入/消耗对比卡片 | 3 天 | 拍照→菜名卡路里入日记；首页显示今日摄入vs运动消耗 |

风险：① 第三方 API 停服/涨价 → 缓存层让切换供应商只改适配器；② 内容版权 → 商用条款留档，页面标注来源；③ 健康声明合规 → 营养建议类文案加"仅供参考，不构成医疗建议"，避免医疗化表述（小程序审核红线）。

**Sources:**
- [聚合数据·菜谱大全 API](https://www.juhe.cn/docs/api/id/46) · [极速数据·菜谱 API](https://www.jisuapi.com/api/recipe/)
- [天行数据·菜谱查询](https://www.tianapi.com/apiview/23) · [天行·营养成分表](https://www.tianapi.com/apiview/121) · [天行·食物营养识别](https://www.tianapi.com/apiview/248)
- [百度 AI 菜品识别](https://ai.baidu.com/tech/imagerecognition/dish) · [接口文档](https://ai.baidu.com/ai-doc/IMAGERECOGNITION/tk3bcxbb0)
- [FatSecret API 实践参考](https://www.jianshu.com/p/f3344a834dca)
