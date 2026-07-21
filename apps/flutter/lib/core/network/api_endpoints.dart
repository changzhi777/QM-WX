/// API 端点常量（与后端 packages/shared ENDPOINTS 对齐）。
///
/// 批 1 仅 auth + user.me；批 2+ 按需扩展（today/checkin/aiCoach/...）。
class ApiEndpoints {
  ApiEndpoints._();

  // ===== auth module（/api/auth/*）=====
  /// 统一登录入口（public）：body { method, payload }
  static const String authLogin = '/api/auth/login';

  /// refresh token 轮换（public）：body { refreshToken }
  static const String authRefresh = '/api/auth/refresh';

  // ===== user module（POST /api/user，body { action, ... }）=====
  static const String userBase = '/api/user';
  static const String actionMe = 'me';

  // ===== stats module（POST /api/stats，body { action, ...payload }）=====
  static const String statsBase = '/api/stats';
  static const String actionHealthScore = 'healthScore';
  static const String actionDailyReport = 'dailyReport';
  static const String actionWeather = 'weather';

  // ===== sport module（POST /api/sport，body { action, payload }）=====
  static const String sportBase = '/api/sport';
  static const String actionCheckin = 'checkin';

  /// 判断是否公开路由（不带 Bearer token）
  static bool isPublic(String path) =>
      path == authLogin || path == authRefresh;
}
