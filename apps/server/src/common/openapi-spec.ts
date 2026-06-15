/**
 * OpenAPI 3.1 规范（手写 — 不引第三方 lib）
 *
 * 覆盖范围（V1 — 6 个核心 module）：
 * - auth（code2Session / refresh）
 * - user（login / me / updateProfile）
 * - mall（listProducts / productDetail / createOrder / cancelOrder / myOrders）
 * - sport（checkin / today / myCheckins / groupRanking）
 * - wxpay（notify — 公开）
 * - admin（listOrders / updateOrderStatus / refundOrder）
 *
 * 原则：zod 做运行时校验，OpenAPI 仅作文档生成（不参与运行时）。
 * 未来扩 module 时：往 paths/components 加 entry 即可。
 */
// OpenAPI 3.1 类型 — 来自 @scalar/fastify-api-reference（间接依赖）
// 避免引 openapi-types（轻量化）
type Document = {
  openapi: string;
  info: Record<string, unknown>;
  servers: Array<{ url: string; description?: string }>;
  tags: Array<{ name: string; description?: string }>;
  components: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
  paths: Record<string, Record<string, unknown>>;
};

export const openapiSpec: Document = {
  openapi: '3.1.0',
  info: {
    title: 'QM-WX API',
    version: '1.0.0',
    description:
      '青沐生命科技 · 微信小程序 + Node 后端 REST API。' +
      '所有 endpoint 共用 `/api/{module}` 前缀，' +
      'POST body 含 `{ action, payload }`，返回 `{ code: 0, data } | { code: 4xx, msg }`。',
    contact: { name: 'BB小子', url: 'https://github.com/qingmu' },
    license: { name: 'MIT' },
  },
  servers: [
    { url: 'http://localhost:3000', description: '开发' },
    { url: 'https://api.example.com', description: '生产（待切真）' },
  ],
  tags: [
    { name: 'auth', description: '鉴权（code2Session / refresh）' },
    { name: 'user', description: '用户（登录 / me / profile）' },
    { name: 'sport', description: '运动（打卡 / 群 / 榜单）' },
    { name: 'mall', description: '商城（商品 / 分类 / 订单）' },
    { name: 'wallet', description: '钱包（余额 / 充值 / 消费）' },
    { name: 'wxpay', description: '微信支付 V3（统一下单 / 通知 / 退款）' },
    { name: 'admin', description: '运营后台（白名单 / 商品 / 订单 / 退款）' },
    { name: 'weekly-report', description: '周报聚合' },
    { name: 'content', description: '内容（赛事 / 酒店 / 景区 / 餐饮）' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
    },
    schemas: {
      // ===== 通用 =====
      ApiEnvelope: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'integer', description: '0 = 成功；非 0 = 错误' },
          data: { description: '成功时返回的数据（无固定 schema）' },
          msg: { type: 'string', description: '错误信息（code 非 0 时）' },
        },
      },
      ErrorResp: {
        type: 'object',
        required: ['code', 'msg'],
        properties: {
          code: { type: 'integer', example: 400 },
          msg: { type: 'string', example: '订单不存在' },
        },
      },

      // ===== auth =====
      Code2SessionInput: {
        type: 'object',
        required: ['code'],
        properties: { code: { type: 'string', description: 'wx.login 拿到的 code' } },
      },
      Code2SessionResp: {
        type: 'object',
        required: ['accessToken', 'refreshToken', 'user'],
        properties: {
          accessToken: { type: 'string' },
          refreshToken: { type: 'string' },
          user: { $ref: '#/components/schemas/User' },
        },
      },

      // ===== user =====
      User: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          openid: { type: 'string' },
          nickname: { type: 'string', nullable: true },
          avatarUrl: { type: 'string', nullable: true },
          phone: { type: 'string', nullable: true },
          points: { type: 'integer', description: '积分余额' },
          memberLevel: { type: 'string', enum: ['free', 'monthly', 'quarterly', 'yearly'] },
        },
      },
      UpdateProfileInput: {
        type: 'object',
        properties: {
          nickname: { type: 'string', maxLength: 32 },
          avatarUrl: { type: 'string' },
          phone: { type: 'string' },
        },
      },

      // ===== mall =====
      Product: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          category: { type: 'string' },
          price: { type: 'string', description: 'Decimal 字符串（如 "10.00"）' },
          originalPrice: { type: 'string', nullable: true },
          images: { type: 'array', items: { type: 'string' } },
          stock: { type: 'integer' },
          status: { type: 'string', enum: ['on', 'off'] },
        },
      },
      CreateOrderInput: {
        type: 'object',
        required: ['items'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              required: ['productId', 'qty'],
              properties: {
                productId: { type: 'string' },
                qty: { type: 'integer', minimum: 1, maximum: 999 },
              },
            },
          },
          pointsUsed: { type: 'integer', minimum: 0, description: '使用积分（1 分 = 0.01 元）' },
          address: { type: 'object', description: '收货地址' },
        },
      },
      CreateOrderResp: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          payParams: {
            type: 'object',
            nullable: true,
            description: '微信支付参数（payAmount>0 时返）',
            properties: {
              prepayId: { type: 'string' },
              nonceStr: { type: 'string' },
              timestamp: { type: 'string' },
              sign: { type: 'string' },
              packageStr: { type: 'string' },
            },
          },
        },
      },
      Order: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string' },
          status: {
            type: 'string',
            enum: ['pending_pay', 'paid', 'shipped', 'done', 'cancelled', 'refunding', 'refunded'],
          },
          totalAmount: { type: 'string' },
          payAmount: { type: 'string' },
          pointsUsed: { type: 'integer' },
          payChannel: { type: 'string', enum: ['wxpay', 'points'], nullable: true },
          wxTransactionId: { type: 'string', nullable: true },
          paidAt: { type: 'string', format: 'date-time', nullable: true },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },

      // ===== sport =====
      CheckinInput: {
        type: 'object',
        required: ['steps'],
        properties: {
          steps: { type: 'integer', minimum: 0, maximum: 100_000 },
          distanceM: { type: 'integer', minimum: 0 },
          durationSec: { type: 'integer', minimum: 0 },
          groupId: { type: 'string' },
          date: { type: 'string', description: 'YYYY-MM-DD' },
        },
      },
      Checkin: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string' },
          groupId: { type: 'string', nullable: true },
          date: { type: 'string' },
          steps: { type: 'integer' },
          points: { type: 'integer' },
        },
      },

      // ===== wxpay =====
      RefundOrderInput: {
        type: 'object',
        required: ['orderId'],
        properties: {
          orderId: { type: 'string' },
          amountFen: { type: 'integer', minimum: 1, description: '退款金额（分），缺省 = 全额' },
          reason: { type: 'string', maxLength: 80 },
        },
      },
      RefundOrderResp: {
        type: 'object',
        properties: {
          orderId: { type: 'string' },
          refundId: { type: 'string' },
          refundYuan: { type: 'number' },
          status: { type: 'string', enum: ['SUCCESS', 'PROCESSING', 'CLOSED', 'ABNORMAL'] },
          refundedBy: { type: 'string' },
        },
      },

      // ===== admin =====
      ListOrdersReq: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['pending_pay', 'paid', 'shipped', 'done', 'cancelled', 'refunded'],
          },
          page: { type: 'integer', minimum: 1, default: 1 },
          pageSize: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
        },
      },

      // ===== 扩展 schemas（V0.1.4 增）=====
      RefundResp: {
        type: 'object',
        properties: {
          refundId: { type: 'string' },
          outTradeNo: { type: 'string' },
          transactionId: { type: 'string' },
          amount: {
            type: 'object',
            properties: {
              refund: { type: 'integer', description: '分' },
              total: { type: 'integer', description: '分' },
              payerTotal: { type: 'integer', nullable: true },
              settlementTotal: { type: 'integer', nullable: true },
            },
          },
          status: {
            type: 'string',
            enum: ['SUCCESS', 'PROCESSING', 'CLOSED', 'ABNORMAL'],
          },
        },
      },
      CheckinResp: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          points: { type: 'integer' },
          steps: { type: 'integer' },
          date: { type: 'string' },
        },
      },
      WalletInfo: {
        type: 'object',
        properties: {
          balance: { type: 'string', description: '元（Decimal 字符串）' },
          status: { type: 'string', enum: ['active', 'frozen'] },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      TransactionResp: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string' },
          type: { type: 'string', enum: ['recharge', 'consume', 'refund'] },
          amount: { type: 'string' },
          orderId: { type: 'string', nullable: true },
          wxTransactionId: { type: 'string', nullable: true },
          outRefundNo: { type: 'string', nullable: true },
          status: { type: 'string', enum: ['success', 'pending', 'failed'] },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      ProductDetail: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          category: { type: 'string' },
          price: { type: 'string' },
          originalPrice: { type: 'string', nullable: true },
          memberDiscount: { type: 'number', nullable: true },
          images: { type: 'array', items: { type: 'string' } },
          description: { type: 'string', nullable: true },
          stock: { type: 'integer' },
          status: { type: 'string', enum: ['on', 'off'] },
        },
      },
      ContentItem: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['article', 'marathon', 'event', 'course'] },
          title: { type: 'string' },
          cover: { type: 'string', nullable: true },
          summary: { type: 'string', nullable: true },
          price: { type: 'number', nullable: true },
          fee: { type: 'number', nullable: true },
          date: { type: 'string', nullable: true },
          location: { type: 'string', nullable: true },
          tags: { type: 'array', items: { type: 'string' }, nullable: true },
          actionType: { type: 'string', enum: ['enroll', 'book', 'link', 'none'] },
          status: { type: 'string', enum: ['on', 'off'] },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    // ===== auth =====
    '/api/auth/refresh': {
      post: {
        tags: ['auth'],
        summary: '刷新 access token',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refreshToken'],
                properties: { refreshToken: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: '成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/Code2SessionResp' } } } },
          '401': { description: 'refresh token 失效', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResp' } } } },
        },
      },
    },

    // ===== user =====
    '/api/user': {
      post: {
        tags: ['user'],
        summary: 'user action 入口（login / me / updateProfile）',
        description: 'action: login(公开) / me(鉴权) / updateProfile(鉴权)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: { type: 'string', enum: ['login', 'me', 'updateProfile'] },
                  payload: { type: 'object' },
                },
              },
              examples: {
                login: { value: { action: 'login', payload: { code: 'wx-login-code' } } },
                me: { value: { action: 'me' } },
                updateProfile: { value: { action: 'updateProfile', payload: { nickname: '智' } } },
              },
            },
          },
        },
        responses: {
          '200': { description: '成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiEnvelope' } } } },
        },
      },
    },

    // ===== mall =====
    '/api/mall': {
      post: {
        tags: ['mall'],
        summary: 'mall action 入口（listProducts / productDetail / createOrder / cancelOrder / myOrders / listCategories）',
        description:
          '公开 action：listProducts / productDetail / listCategories\n' +
          '鉴权 action：createOrder / cancelOrder / myOrders',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: {
                    type: 'string',
                    enum: ['listProducts', 'productDetail', 'listCategories', 'createOrder', 'cancelOrder', 'myOrders'],
                  },
                  payload: { type: 'object' },
                },
              },
              examples: {
                createOrder: {
                  value: {
                    action: 'createOrder',
                    payload: { items: [{ productId: 'p1', qty: 1 }], pointsUsed: 100 },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiEnvelope' } } } },
        },
      },
    },

    // ===== sport =====
    '/api/sport': {
      post: {
        tags: ['sport'],
        summary: 'sport action 入口（checkin / today / myCheckins / myGroups / groupRanking）',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: { type: 'string' },
                  payload: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '成功' },
        },
      },
    },

    // ===== wxpay (公开) =====
    '/api/wxpay': {
      post: {
        tags: ['wxpay'],
        summary: '微信支付回调 + 退款 + 对账查询',
        description:
          '微信支付 V3 异步通知 — **公开端点**（不走 JWT）\n' +
          'action: notify(微信回调) / refund(admin 调) / queryBill(admin 调)',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: { type: 'string', enum: ['notify', 'refund', 'queryBill'] },
                  payload: { type: 'object' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '成功（微信侧也接受 200 停止重试）' },
          '400': { description: '验签失败 / 业务异常' },
        },
      },
    },

    // ===== admin =====
    '/api/admin': {
      post: {
        tags: ['admin'],
        summary: 'admin action 入口（仅 admin）',
        description:
          '全部 action 需 admin 白名单 + JWT。\n' +
          '核心 action: listOrders / updateOrderStatus / refundOrder / upsertProduct / upsertContent / setConfig / listAdmins',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['action'],
                properties: {
                  action: {
                    type: 'string',
                    enum: ['listOrders', 'updateOrderStatus', 'refundOrder', 'upsertProduct', 'upsertContent', 'setConfig', 'listAdmins'],
                  },
                  payload: { type: 'object' },
                },
              },
              examples: {
                refundOrder: {
                  value: {
                    action: 'refundOrder',
                    payload: { orderId: 'o123', amountFen: 500, reason: '用户申请' },
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: '成功', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiEnvelope' } } } },
          '403': { description: '非 admin', content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResp' } } } },
        },
      },
    },
  },
};
