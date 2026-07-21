// 认证数据模型（手写不可变）。
//
// Phase 1 批 1 模型少，不上 freezed/json_serializable codegen；
// 批 2+ 模型暴涨后再统一切 codegen（YAGNI）。

class LoginRequest {
  const LoginRequest({required this.method, required this.payload});
  final String method; // 批 1 仅 'password'；Phase 1.5 + 'wechat'/'phone'/'email'
  final Map<String, dynamic> payload;

  Map<String, dynamic> toJson() => {'method': method, 'payload': payload};

  factory LoginRequest.password(String username, String password) =>
      LoginRequest(method: 'password', payload: {
        'username': username,
        'password': password,
      });
}

class LoginResponse {
  const LoginResponse({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });
  final String accessToken;
  final String refreshToken;
  final AppUser user;

  factory LoginResponse.fromJson(Map<String, dynamic> j) => LoginResponse(
        accessToken: j['accessToken'] as String,
        refreshToken: j['refreshToken'] as String,
        user: AppUser.fromJson(j['user'] as Map<String, dynamic>),
      );
}

/// 用户模型（核心字段；与后端 toUserOutput 对齐）。
///
/// 后端返更多字段（phone/email/certified/stats/...），这里只取批 1 所需，
/// 其余忽略——新增字段不破坏解析（向前兼容）。
class AppUser {
  const AppUser({
    required this.id,
    this.nickname,
    this.avatarUrl,
    this.username,
    this.memberLevel = 'free',
    this.points = 0,
    this.growthLevel = 'free',
  });

  final String id;
  final String? nickname;
  final String? avatarUrl;
  final String? username;
  final String memberLevel; // free / monthly / quarterly / yearly
  final int points;
  final String growthLevel; // free / bronze / silver / gold / diamond

  factory AppUser.fromJson(Map<String, dynamic> j) => AppUser(
        id: j['id'] as String,
        nickname: j['nickname'] as String?,
        avatarUrl: j['avatarUrl'] as String?,
        username: j['username'] as String?,
        memberLevel: (j['memberLevel'] as String?) ?? 'free',
        points: (j['points'] as num?)?.toInt() ?? 0,
        growthLevel: (j['growthLevel'] as String?) ?? 'free',
      );

  /// 展示名：nickname 优先，回退 username，再回退默认。
  String get displayName {
    if ((nickname ?? '').isNotEmpty) return nickname!;
    if ((username ?? '').isNotEmpty) return username!;
    return '沐禾用户';
  }

}
