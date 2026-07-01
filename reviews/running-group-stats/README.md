# 青沐生命科技小程序 · 重构文档包

> 生成日期：2026-06-10　|　基于代码库 running-group-stats 全量审查（15 页面 / 13 云函数 / ~8800 行）

## 文档导航

| 文档 | 内容 | 读者 |
|---|---|---|
| [01-code-review.md](01-code-review.md) | 代码审查报告：P0/P1/P2 问题清单、各文件速查表 | 全体开发 |
| [02-architecture.md](02-architecture.md) | 重构架构：目录结构、数据库集合、云函数 API 契约、登录/群/支付流程 | 开发（实现依据） |
| [03-product-prototype.md](03-product-prototype.md) | 产品原型与业务建议：业务闭环、竞品参考、逐页交互说明 | 产品 + 开发 |
| [04-task-breakdown.md](04-task-breakdown.md) | 任务拆解：5 个 Phase、验收标准、里程碑、风险登记 | 项目负责人 + 开发 |
| [05-payment.md](05-payment.md) | 支付接入：微信支付/支付宝申请方法与材料、开发细则、参考代码、积分内部化规则 | 负责人（申请）+ 开发 |
| [06-device-integration.md](06-device-integration.md) | 手表/手环对接：蓝牙 BLE 实时心率 + 各厂商平台 OAuth 授权数据采集（Phase 6 任务表） | 开发 |
| [07-food-nutrition-apis.md](07-food-nutrition-apis.md) | 国内菜谱/营养 API 选型：菜谱内容、营养成分、AI 菜品识别、缓存代理设计 | 产品 + 开发 |
| [08-recipe-ingestion-and-ludong.md](08-recipe-ingestion-and-ludong.md) | 菜谱采集 ETL 管道（统一 Schema/去重/审核）+ 内部律动平台双向对接规范（Phase 7） | 开发 + 律动团队 |
| [09-code-optimization.md](09-code-optimization.md) | 代码优化清单（重扫）：性能/包体/去重/可维护性，含 before/after 与优先级 | 开发 |
| review-package.html | 全部文档的网页汇总版（可浏览器打开/打印） | 任何人 |
| review-package.pdf | PDF 版（可打印/分发） | 任何人 |

## 30 秒结论

1. 现状是**可演示原型**：约 80% 功能为模拟实现，不可直接上线。
2. **三个致命问题必须先修**：钱包余额客户端可篡改（P0-1）、云函数信任前端 openid（P0-2/3）、"自动统计微信群消息"无微信开放能力支撑（P0-6，需按 02 §5.2 的 shareTicket+打卡方案重做）。
3. 支付依赖商户号审批，**钱包/会员购买/支付全部挂功能开关**，V1.0 用"积分兑换 + 意向单"先行上线。
4. 重构总量约 **28–35 人天**，按 04 文档 Phase 0→5 执行，Phase 0 地基不完成不开发业务。
