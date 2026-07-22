/// 简版用户（follow 列表项内嵌）。
class SimpleUser {
  const SimpleUser({required this.id, this.nickname, this.avatarUrl});
  final String id;
  final String? nickname;
  final String? avatarUrl;

  factory SimpleUser.fromJson(Map<String, dynamic> j) => SimpleUser(
        id: (j['id'] as String?) ?? '',
        nickname: j['nickname'] as String?,
        avatarUrl: j['avatarUrl'] as String?,
      );
}

/// 关注/粉丝列表项。
class FollowUser {
  const FollowUser({required this.userId, required this.user, this.createdAt});
  final String userId;
  final SimpleUser user;
  final String? createdAt;

  factory FollowUser.fromJson(Map<String, dynamic> j) => FollowUser(
        userId: (j['userId'] as String?) ?? '',
        user: SimpleUser.fromJson((j['user'] as Map<String, dynamic>?) ?? const {}),
        createdAt: j['createdAt'] as String?,
      );
}

/// 关注/粉丝计数。
class FollowCounts {
  const FollowCounts({required this.followingCount, required this.followerCount});
  final int followingCount;
  final int followerCount;

  factory FollowCounts.fromJson(Map<String, dynamic> j) => FollowCounts(
        followingCount: (j['followingCount'] as num?)?.toInt() ?? 0,
        followerCount: (j['followerCount'] as num?)?.toInt() ?? 0,
      );
}
