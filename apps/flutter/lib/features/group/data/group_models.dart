// 跑群模型（与后端 sport 群 action 对齐）。

class Group {
  const Group({required this.id, required this.name, this.memberCount = 0, this.role = 'member', this.joinedAt = ''});
  final String id;
  final String name;
  final int memberCount;
  final String role; // owner | member
  final String joinedAt;

  factory Group.fromJson(Map<String, dynamic> j) => Group(
        id: (j['id'] as String?) ?? '',
        name: (j['name'] as String?) ?? '',
        memberCount: (j['memberCount'] as num?)?.toInt() ?? 0,
        role: (j['role'] as String?) ?? 'member',
        joinedAt: (j['joinedAt'] as String?) ?? '',
      );

  bool get isOwner => role == 'owner';
}

class GroupUser {
  const GroupUser({required this.id, this.nickname, this.avatarUrl});
  final String id;
  final String? nickname;
  final String? avatarUrl;
  factory GroupUser.fromJson(Map<String, dynamic> j) => GroupUser(
        id: (j['id'] as String?) ?? '',
        nickname: j['nickname'] as String?,
        avatarUrl: j['avatarUrl'] as String?,
      );
  String get displayName => (nickname ?? '').isNotEmpty ? nickname! : '跑者';
}

class GroupDetail {
  const GroupDetail({required this.id, required this.name, this.owner, this.memberCount = 0, this.totalDistance = 0, this.totalCheckins = 0, this.activeDays = 0, this.announce});
  final String id;
  final String name;
  final GroupUser? owner;
  final int memberCount;
  final double totalDistance;
  final int totalCheckins;
  final int activeDays;
  final String? announce;

  factory GroupDetail.fromJson(Map<String, dynamic> j) => GroupDetail(
        id: (j['id'] as String?) ?? '',
        name: (j['name'] as String?) ?? '',
        owner: j['owner'] is Map<String, dynamic> ? GroupUser.fromJson(j['owner'] as Map<String, dynamic>) : null,
        memberCount: (j['memberCount'] as num?)?.toInt() ?? 0,
        totalDistance: (j['totalDistance'] as num?)?.toDouble() ?? 0,
        totalCheckins: (j['totalCheckins'] as num?)?.toInt() ?? 0,
        activeDays: (j['activeDays'] as num?)?.toInt() ?? 0,
        announce: j['announce'] as String?,
      );
}

class GroupRankEntry {
  const GroupRankEntry({required this.userId, this.nickname = '', this.avatarUrl, this.distance = 0, this.count = 0, this.points = 0});
  final String userId;
  final String nickname;
  final String? avatarUrl;
  final double distance;
  final int count;
  final int points;

  factory GroupRankEntry.fromJson(Map<String, dynamic> j) => GroupRankEntry(
        userId: (j['userId'] as String?) ?? '',
        nickname: (j['nickname'] as String?) ?? '',
        avatarUrl: j['avatarUrl'] as String?,
        distance: (j['distance'] as num?)?.toDouble() ?? 0,
        count: (j['count'] as num?)?.toInt() ?? 0,
        points: (j['points'] as num?)?.toInt() ?? 0,
      );

  String get displayName => nickname.isNotEmpty ? nickname : '跑者';
}

class CreateGroupRequest {
  const CreateGroupRequest(this.name);
  final String name;
  Map<String, dynamic> toJson() => {'name': name};
}

class JoinGroupRequest {
  const JoinGroupRequest(this.groupId);
  final String groupId;
  Map<String, dynamic> toJson() => {'groupId': groupId};
}
