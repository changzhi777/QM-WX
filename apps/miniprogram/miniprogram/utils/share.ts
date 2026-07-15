/**
 * 分享工具（V0.2.6 邀请裂变）
 *
 * buildSharePath：给分享 path 拼当前用户 inviterCode（用于裂变追踪）。
 * inviterCode 由 app.ts 登录后预加载到 globalData，分享时同步读（onShareAppMessage 是同步 return，不能 await）。
 */

/** 拼 inviterCode 到分享 path（basePath 可能已含 query，自动判断 ? / &）*/
export function buildSharePath(basePath: string, inviterCode?: string): string {
  if (!inviterCode) return basePath;
  const sep = basePath.includes('?') ? '&' : '?';
  return `${basePath}${sep}inviterCode=${inviterCode}`;
}
