// config/env.ts — 环境配置
import { API_BASE } from '@qm-wx/shared/api-contracts';

export const ENV = {
  apiBase: API_BASE.dev, // 由 app.ts onLaunch 覆盖为 staging/prod
  brand: '#0FAF8E',
  brandName: '青沐',
};
