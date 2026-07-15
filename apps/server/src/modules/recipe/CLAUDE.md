# recipe — 饮食推荐 module（V2 stub）

> 📍 面包屑：`QM-WX/` → [`根 CLAUDE.md`](../../../CLAUDE.md) → [`apps/server/CLAUDE.md`](../../../CLAUDE.md) → **apps/server/src/modules/recipe/**（这里）
>
> **GAP-12 收口补建**（init #10 2026-07-15）+ **V2 stub**

---

## 🎯 职责

饮食推荐 module(**V2 stub**,Phase 7 实现)。

**当前 6 action（Zod schema 已定义,service 部分 stub）**：
- `listRecipes` — 食谱列表
- `recipeDetail` — 食谱详情
- `nutritionSearch` — 营养搜索
- `dishRecognize` — 菜品识别(图 → 菜)
- `logMeal` — 记录一餐(类似 food.record,但走 recipe 范式)
- `myMeals` — 我的饮食历史

---

## 📂 文件清单

| 文件 | 说明 |
| --- | --- |
| `recipe.service.ts` | 6 action stub(部分可返 mock 数据) |
| `recipe.schema.ts` | 6 个 Zod schema:DishRecognizeInputSchema / ListRecipesInputSchema / LogMealInputSchema / MyMealsInputSchema / NutritionSearchInputSchema / RecipeDetailInputSchema |
| `recipe.routes.ts` | POST /api/recipe switch 分发(6 case) |

**状态**：routes + schema 已落地,service 是 stub(YAGNI,等真正落地饮食推荐算法时实现)。

---

## 🚪 API（6 action）

| Action | 鉴权 | Payload | 说明 |
| --- | --- | --- | --- |
| `listRecipes` | 公开 | `{ keyword?, category?, page? }` | 食谱列表 |
| `recipeDetail` | 公开 | `{ id }` | 食谱详情 |
| `nutritionSearch` | 需登录 | `{ keyword }` | 营养搜索 |
| `dishRecognize` | 需登录 | `{ imageBase64 }` | 菜品识别(图 → 菜,**待 V0.2.x ocr 集成**) |
| `logMeal` | 需登录 | `{ items }` | 记录一餐 |
| `myMeals` | 需登录 | `{ date? }` | 我的饮食历史 |

---

## 🔑 现状

### 与 food module 的关系（V0.2.0+）
- **food**：基于 FatSecret 第三方食物库(西方 + 国际)
- **recipe**：基于推荐算法 + 菜品识别(中式饮食,待 OCR 集成)
- **YAGNI 决策**：当前 recipe 6 action stub,优先用 food.module 满足饮食维度;recipe 留待真正需要"菜品识别 + 中式饮食"时再实现

### dishRecognize 与 ocr 集成（待办）
V0.2.1 ocr module 已落地 generalBasic/generalAccurate,recipe.dishRecognize 未来可调 ocrService.generalBasic 识别菜品 + recipe 内部算法匹配菜谱。

---

## 📦 依赖

- 暂无(全 stub)

---

## 📌 当前状态

- ✅ routes 6 case switch 落地
- ✅ schema 6 个 Zod 已定义
- ⚠️ service 全 stub(返 mock 数据或空)
- ⏳ dishRecognize 未来调 ocr module

---

🤙 **GAP-12 收口补建**:recipe module CLAUDE.md。V2 stub,YAGNI 仅作 GAP-12 收口追踪用 — 真正落地建议**优先用 food module**(V0.2.0 已成熟)。