/**
 * Order / OrderItem fixture
 */
import { makeProduct } from './product.fixture.js';

export type OrderStatus = 'pending_pay' | 'paid' | 'shipped' | 'done' | 'cancelled';

export interface OrderItemFixture {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  quantity: number;
  price: number | string;
}

export interface OrderFixture {
  id: string;
  userId: string;
  status: OrderStatus;
  totalAmount: number | string;
  payAmount: number | string;
  pointsUsed: number;
  contactName: string | null;
  contactPhone: string | null;
  address: string | null;
  createdAt: Date;
  updatedAt: Date;
  items?: OrderItemFixture[];
}

export function makeOrder(overrides: Partial<OrderFixture> = {}): OrderFixture {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: 'pending_pay',
    totalAmount: 99,
    payAmount: 99,
    pointsUsed: 0,
    contactName: '收件人',
    contactPhone: '13800000000',
    address: '北京市朝阳区',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    items: [makeOrderItem()],
    ...overrides,
  };
}

export function makeOrderItem(overrides: Partial<OrderItemFixture> = {}): OrderItemFixture {
  const p = makeProduct();
  return {
    id: 'order-item-1',
    orderId: 'order-1',
    productId: p.id,
    productName: p.name,
    quantity: 1,
    price: p.price,
    ...overrides,
  };
}
