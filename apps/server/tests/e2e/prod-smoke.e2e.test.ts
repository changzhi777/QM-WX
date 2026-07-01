/**
 * 生产公网 smoke e2e — 验证 https://qingmulife.cn 链路全通
 *
 * 默认 skip（PROD_SMOKE=1 才启用）— 不影响本地单元测试 / CI 默认流程
 * 跑法：PROD_SMOKE=1 pnpm test -- prod-smoke
 *
 * 与 in-process e2e（sport-flow / mall-flow）不同：
 * - 不连 PG/Redis（只测 HTTP 层）
 * - 不 mock code2Session（测真鉴权链）
 * - 不清理数据（只读 + 无副作用测试）
 * - 失败原因直观：HTTPS / nginx / container / 鉴权链 任一不通都看得见
 *
 * 适用场景：
 * - 生产部署后第一波冒烟
 * - main 分支 CI 定时跑（每周一次）
 * - 切换域名/证书后回归
 */
import { describe, it, expect } from 'vitest';

const PROD_BASE = 'https://qingmulife.cn';

/** fetch with timeout — 防 server 挂起 / 网络卡住卡死 CI（默认 300s） */
const fetchWithTimeout = async (url: string, init?: RequestInit, timeoutMs = 10_000): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const skip = !process.env.PROD_SMOKE;
const itSmoke = skip ? it.skip : it;

describe('生产公网 smoke（PROD_SMOKE=1）', () => {
  itSmoke('GET /health → 200 + status=ok + env=production', async () => {
    const res = await fetchWithTimeout(`${PROD_BASE}/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as { status?: string; env?: string; uptime?: number };
    expect(body.status).toBe('ok');
    expect(body.env).toBe('production');
    expect(typeof body.uptime).toBe('number');
  });

  itSmoke('POST /api/user login with fake code → 400 invalid code（鉴权链通）', async () => {
    const res = await fetchWithTimeout(`${PROD_BASE}/api/user`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        action: 'login',
        payload: { code: `smoke_fake_${Date.now()}` },
      }),
    });

    // 期望 400 + message 含 invalid code — 证明 HTTPS→nginx→server→code2Session 全链路通
    // 如果 appid/secret 错会返 invalid appid（不同）；如果链路断会返 5xx 或网络错
    expect(res.status).toBe(400);
    const body = (await res.json()) as { message?: string };
    expect(body.message).toMatch(/invalid code/i);
  });

  itSmoke('POST /api/sport myStats 无 token → 401（鉴权 middleware 通）', async () => {
    const res = await fetchWithTimeout(`${PROD_BASE}/api/sport`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'myStats', payload: { period: 'week' } }),
    });
    expect(res.status).toBe(401);
  });

  // 暂不测 GET /openapi.json — nginx conf 没反代该路径（被企业官网 server_name 拦），
  // 属于 dev-only 资源，生产冒烟不必要。如需：deploy/nginx-qmwx-api.conf 加 location = /openapi.json
});