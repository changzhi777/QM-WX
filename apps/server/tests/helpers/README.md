# 测试 helpers + fixtures 使用约定

## 目录结构

```
tests/
├── helpers/
│   ├── mockErrors.ts        # 共享 Errors mock（替代 15+ 文件重复定义）
│   └── mockPrisma.ts        # Prisma + transaction mock 工厂
├── fixtures/
│   ├── user.fixture.ts      # makeUser / makeUserOutput
│   ├── product.fixture.ts   # makeProduct / makeCategory
│   ├── order.fixture.ts     # makeOrder / makeOrderItem
│   └── group.fixture.ts     # makeGroup / makeGroupMember / makeCheckin
└── modules/...
```

## 用法示例

### 1. mockErrors

```ts
import { mockErrors } from '../../helpers/mockErrors.js';

vi.mock('src/common/errors.js', () => ({ Errors: mockErrors }));

// 测试时直接断言
await expect(...).rejects.toThrow(/wallet not found/);
```

返回的 Error 带 `code` + `statusCode` 字段，可断言：

```ts
await expect(...).rejects.toMatchObject({ code: 404, statusCode: 404 });
```

### 2. mockPrisma

```ts
import { createPrismaMock } from '../../helpers/mockPrisma.js';

const mocks = vi.hoisted(() => {
  const helpers = require('../../helpers/mockPrisma.ts') as typeof import('../../helpers/mockPrisma.js');
  return helpers.createPrismaMock({
    models: ['wallet', 'walletTransaction'],
    txModels: ['wallet', 'walletTransaction'],  // 事务内 tx.xxx 用到的
  });
});

vi.mock('src/infra/prisma.js', () => ({ prisma: mocks.prisma }));

beforeEach(() => {
  vi.clearAllMocks();
  // clearAllMocks 会清掉 $transaction 的 mockImplementation，需重新绑定
  mocks.prisma.$transaction.mockImplementation((fn) => fn(mocks.tx));
});

// 测试中：
mocks.prisma.wallet.findUnique.mockResolvedValue(...);
mocks.tx.wallet.update.mockResolvedValue(...);  // 事务内
```

为什么要用 `require()`？因 `vi.hoisted` 在所有 ESM `import` 之前执行，
而 `vi.fn()` 在 hoisted 上下文可用 — 用 `require()` 同步加载，避免 hoist 时
helpers 模块还没解析的问题。

### 3. fixtures

```ts
import { makeUser } from '../../fixtures/user.fixture.js';
import { makeOrder, makeOrderItem } from '../../fixtures/order.fixture.js';

const user = makeUser({ points: 1000 });
const order = makeOrder({
  userId: user.id,
  status: 'paid',
  items: [makeOrderItem({ quantity: 2 })],
});
```

字段默认值参考各 fixture 文件顶部的 `makeXxx` 函数 — 仅覆盖关心的字段。

## Redis Mock 约定（按职责分层）

| 测什么 | mock 方式 | 示例 |
| --- | --- | --- |
| **infra 层**（redis.ts 单例本身） | `vi.mock('ioredis', ...)` | `tests/infra/redis.test.ts` |
| **业务层**（service / job） | `vi.mock('src/infra/redis.js', ...)` | `tests/common/integrations/wx/code2session.test.ts` |

不需要"统一"为同一种 — 这是按层 mock 的正确分工，不是混乱。

## 旧测试迁移建议

**不强制重构**：旧测试可以继续用自有的 hoisted mock 写法。
**新增测试**：一律走 helpers + fixtures，3 倍效率（无需重写样板）。

参考实现：`tests/modules/wallet/wallet.service.test.ts`（重构前 231 行 → 重构后 183 行，减 21%）。
