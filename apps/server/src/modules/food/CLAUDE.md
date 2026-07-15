# food — 饮食日记 module（V0.2.0 第 33 个 module）

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../CLAUDE.md) → [`apps/server/CLAUDE.md`](../../../CLAUDE.md) → **apps/server/src/modules/food/**（这里）
>
> 创建于 **V0.2.0 / 2026-07-15**（init #10 校准）

---

## 🎯 职责

接入 **FatSecret Platform API**（OAuth2 client_credentials，无用户授权），为小程序提供：
- 食物搜索（food.search.v2）+ 营养详情（food.get.v2，每 100g 宏量）
- 饮食日记（Meal 落库 + Meal.items 宏量字段）
- 食物搜索缓存（FoodCache 表 1h TTL，hitCount 累加）

**复用现有表**：
- `Meal`（V2 stub 阶段已建，V0.2.0 启用）
- `FoodCache`（V2 stub 阶段已建，V0.2.0 启用 + 1h TTL）

**数据流**：
```
search(keyword) → FoodCache 命中?返 : searchFood(FatSecret) + 落 FoodCache
nutrition(foodId) → getFoodNutrition(food.get.v2 每 100g 宏量)
recordMeal(items[]) → 算 totalCalorie + 落 Meal（items 含 calorie/protein/fat/carb/qty/foodId）
myMeals(date?) → 某日所有 Meal + 宏量汇总（calorie/protein/fat/carb）
```

**Meal.items 结构（V0.2.0 宏量升级）**：
```ts
interface MealItem {
  name: string;
  calorie: number;        // 该项总卡路里（已按 qty 换算）
  protein?: number;       // 克
  fat?: number;           // 克
  carb?: number;          // 克
  qty?: string;           // 份量描述（"1 碗" / "200g"）
  foodId?: string;        // FatSecret food_id（可选，便于追溯）
}
```

---

## 📂 文件清单

| 文件 | 行数 | 说明 |
| --- | ---: | --- |
| `client.ts` | 89 | FatSecret OAuth2 client_credentials + food.search.v2 / food.get.v2 原生 fetch + tokenCache 缓存 |
| `food.service.ts` | ~150 | 5 action：search / nutrition / recordMeal / myMeals / removeMeal + FoodCache 1h TTL + Meal.items 宏量升级 |
| `food.routes.ts` | 55 | POST /api/food { action, payload } switch 分发（5 case）+ isFatSecretConfigured 双重校验 |

**测试**：
- `apps/server/tests/modules/food/food.service.test.ts`（12 用例）
- `apps/server/tests/modules/food/food.routes.test.ts`（10 用例）
- **合计 22 单测**

---

## 🚪 API（5 action）

| Action | Payload | 返回 | 鉴权 |
| --- | --- | --- | --- |
| `search` | `{ query: string }` | `{ list: FoodItem[] }` | 需 FatSecret 配置 |
| `nutrition` | `{ foodId: string }` | `{ item: FoodItem }` | 需 FatSecret 配置 |
| `record` | `{ mealType, items, date? }` | `{ meal, totalCalorie }` | 鉴权登录 |
| `myMeals` | `{ date?: string }` | `{ date, list, summary }` | 鉴权登录 |
| `removeMeal` | `{ mealId: string }` | `{ removed: true }` | 鉴权仅本人 |

**Meal.mealType**：`'breakfast' \| 'lunch' \| 'dinner' \| 'snack'`

---

## 🔑 环境变量

```bash
# .env / .env.example
FATSECRET_KEY=your_fatsecret_client_id
FATSECRET_SECRET=your_fatsecret_client_secret
```

**未配置时**：
- `search` / `nutrition` 抛 `badRequest: 饮食搜索未配置（FATSECRET_KEY 缺失）`
- `record` / `myMeals` / `removeMeal` 不受影响（用户可手填卡路里）

**生产申请路径**：https://platform.fatsecret.com → 注册应用 → OAuth2 client_credentials

---

## 🧪 测试覆盖

**22 单测**：
- `food.service.test.ts` 12 例（FoodCache 命中/未命中 + hitCount 累加 + 缓存写失败不阻塞 + recordMeal totalCalorie 算 + myMeals 今日默认 CN 时区 + removeMeal 仅本人鉴权）
- `food.routes.test.ts` 10 例（5 action switch 分发 + isFatSecretConfigured 双重校验 + Payload 校验）

**Mock 范式**：
```ts
vi.mock('../../infra/prisma.js', () => ({
  prisma: { foodCache: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }, meal: { create: vi.fn(), findMany: vi.fn(), delete: vi.fn() } },
}));
```

---

## ⚠️ 关键设计决策

1. **复用 Meal/FoodCache 表**（V2 stub 阶段已建）：不新表，启用 + 加宏量字段注释；老 stub 阶段 Json 数据兼容（V0.2.0 字段注释升级 `items: [{name, calorie, protein?, fat?, carb?, qty?, foodId?}]`）
2. **原生 fetch 无 SDK**（同 V0.1.139 智谱 GLM 范式）：避免 SDK 依赖膨胀 + 可控性强
3. **tokenCache 缓存**：expires_in - 60s 提前刷新（避免临界过期）
4. **FoodCache 1h TTL**：食物库低频变化，hitCount 累加（缓存命中率可观测）
5. **缓存失败不阻塞**：prisma.foodCache.create / hitCount.update 失败 try/catch 吞错，主链路优先

---

## 📦 依赖

- `@prisma/client`（Meal + FoodCache 表）
- `fetch`（Node 18+ 原生，无 SDK）

---

## 🚧 待办

- [ ] 主人手动注入生产 `FATSECRET_KEY` / `FATSECRET_SECRET`（修改 .env 后重启 server）
- [ ] 前端 diet 页真机验证（V0.2.0 新页 + 字段命名 + 事件穿透）

---

🤙 **V0.2.0 完成**：food 第 33 个 module，22 单测，Meal.items 宏量升级，FoodCache 1h TTL；下一步 FATSECRET_KEY 生产注入 + diet 页真机验证。