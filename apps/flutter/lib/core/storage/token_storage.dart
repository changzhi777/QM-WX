import 'package:shared_preferences/shared_preferences.dart';

/// token 持久化（access + refresh）。
///
/// Phase 1 批 1 用 shared_preferences（轻量键值）；
/// Phase 2 离线数据（GPS 轨迹缓存等）改 hive。
class TokenStorage {
  TokenStorage._();

  static const _kAccess = 'auth.access';
  static const _kRefresh = 'auth.refresh';

  static Future<String?> get access async =>
      (await SharedPreferences.getInstance()).getString(_kAccess);

  static Future<String?> get refresh async =>
      (await SharedPreferences.getInstance()).getString(_kRefresh);

  static Future<void> save({String? access, String? refresh}) async {
    final sp = await SharedPreferences.getInstance();
    if (access != null) await sp.setString(_kAccess, access);
    if (refresh != null) await sp.setString(_kRefresh, refresh);
  }

  static Future<void> clear() async {
    final sp = await SharedPreferences.getInstance();
    await sp.remove(_kAccess);
    await sp.remove(_kRefresh);
  }
}
