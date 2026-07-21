import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'auth_models.dart';

/// 认证远程数据源：login（账号密码）+ me（当前用户）。
class AuthRemote {
  AuthRemote._();

  /// 账号密码登录 → {accessToken, refreshToken, user}
  static Future<LoginResponse> login(String username, String password) async {
    final data = await ApiClient.instance.postJson(
      ApiEndpoints.authLogin,
      data: LoginRequest.password(username, password).toJson(),
    );
    return LoginResponse.fromJson(data);
  }

  /// 当前用户信息（POST /api/user action:me）
  ///
  /// 后端返 data = { user: {...}, config: {...} }；取 user 字段。
  static Future<AppUser> me() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.userBase,
      ApiEndpoints.actionMe,
    );
    final userJson = (data['user'] as Map<String, dynamic>?) ?? data;
    return AppUser.fromJson(userJson);
  }
}
