import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/storage/token_storage.dart';
import '../data/auth_models.dart';
import '../data/auth_remote.dart';

/// 认证状态（不可变值对象）
class AuthState {
  const AuthState({this.user, this.authenticated = false});
  final AppUser? user;
  final bool authenticated;

  static const empty = AuthState();
}

/// 认证控制器（Riverpod AsyncNotifier）。
///
/// 状态机：loading（恢复中）→ data(AuthState)。
/// - [restoreSession]：启动时调，有 access token 则 me 刷新用户，失败清 token。
/// - [loginWithPassword]：账号密码登录，成功存 token + 用户。
/// - [logout]：清 token + 状态。
class AuthController extends AsyncNotifier<AuthState> {
  @override
  AuthState build() => AuthState.empty;

  /// 启动恢复会话（main runApp 前调用）
  Future<void> restoreSession() async {
    final token = await TokenStorage.access;
    if (token == null || token.isEmpty) {
      state = const AsyncValue.data(AuthState.empty);
      return;
    }
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final user = await AuthRemote.me();
      return AuthState(user: user, authenticated: true);
    });
    // me 失败（token 过期 + refresh 也失败已被拦截器清 token）→ 回到未登录
    if (state.hasError) {
      await TokenStorage.clear();
      state = const AsyncValue.data(AuthState.empty);
    }
  }

  /// 账号密码登录
  Future<void> loginWithPassword(String username, String password) async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async {
      final resp = await AuthRemote.login(username, password);
      await TokenStorage.save(
        access: resp.accessToken,
        refresh: resp.refreshToken,
      );
      return AuthState(user: resp.user, authenticated: true);
    });
  }

  /// 登出
  Future<void> logout() async {
    await TokenStorage.clear();
    state = const AsyncValue.data(AuthState.empty);
  }
}

final authProvider =
    AsyncNotifierProvider<AuthController, AuthState>(AuthController.new);
