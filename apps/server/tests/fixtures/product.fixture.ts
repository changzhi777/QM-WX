/**
 * Product / Category fixture
 */

export interface ProductFixture {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  price: number | string; // Prisma Decimal 序列化为 string，单测可传 number
  originalPrice: number | string | null;
  memberDiscount: number | null;
  images: string[];
  description: string | null;
  stock: number;
  status: 'on' | 'off';
  sort: number;
  createdAt: Date;
  updatedAt: Date;
}

export function makeProduct(overrides: Partial<ProductFixture> = {}): ProductFixture {
  return {
    id: 'product-1',
    name: '测试商品',
    category: 'cat-default',
    brand: null,
    price: 99,
    originalPrice: 129,
    memberDiscount: null,
    images: ['https://example.com/img.jpg'],
    description: '商品描述',
    stock: 100,
    status: 'on',
    sort: 0,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

export interface CategoryFixture {
  id: string;
  name: string;
  sort: number;
  status: 'on' | 'off';
}

export function makeCategory(overrides: Partial<CategoryFixture> = {}): CategoryFixture {
  return {
    id: 'cat-default',
    name: '默认分类',
    sort: 0,
    status: 'on',
    ...overrides,
  };
}
