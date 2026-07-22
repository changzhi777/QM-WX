// 运动动态模型（与后端 feed.list / publish 对齐）。

class FeedUser {
  const FeedUser({required this.id, this.nickname, this.avatarUrl});
  final String id;
  final String? nickname;
  final String? avatarUrl;

  factory FeedUser.fromJson(Map<String, dynamic> j) => FeedUser(
        id: (j['id'] as String?) ?? '',
        nickname: j['nickname'] as String?,
        avatarUrl: j['avatarUrl'] as String?,
      );

  String get displayName =>
      (nickname ?? '').isNotEmpty ? nickname! : '跑者';
}

class Feed {
  const Feed({
    required this.id,
    required this.content,
    this.images = const [],
    this.distanceKm,
    this.topic,
    this.likeCount = 0,
    this.commentCount = 0,
    this.liked = false,
    this.createdAt = '',
    this.user,
  });

  final String id;
  final String content;
  final List<String> images;
  final double? distanceKm;
  final String? topic;
  final int likeCount;
  final int commentCount;
  final bool liked;
  final String createdAt;
  final FeedUser? user;

  factory Feed.fromJson(Map<String, dynamic> j) => Feed(
        id: (j['id'] as String?) ?? '',
        content: (j['content'] as String?) ?? '',
        images: ((j['images'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(),
        distanceKm: (j['distanceKm'] as num?)?.toDouble(),
        topic: j['topic'] as String?,
        likeCount: (j['likeCount'] as num?)?.toInt() ?? 0,
        commentCount: (j['commentCount'] as num?)?.toInt() ?? 0,
        liked: (j['liked'] as bool?) ?? false,
        createdAt: (j['createdAt'] as String?) ?? '',
        user: j['user'] is Map<String, dynamic>
            ? FeedUser.fromJson(j['user'] as Map<String, dynamic>)
            : null,
      );

  Feed copyWith({bool? liked, int? likeCount}) => Feed(
        id: id,
        content: content,
        images: images,
        distanceKm: distanceKm,
        topic: topic,
        likeCount: likeCount ?? this.likeCount,
        commentCount: commentCount,
        liked: liked ?? this.liked,
        createdAt: createdAt,
        user: user,
      );
}

class PublishFeedRequest {
  const PublishFeedRequest({required this.content, this.distanceKm});
  final String content;
  final double? distanceKm;

  Map<String, dynamic> toJson() {
    final m = <String, dynamic>{'content': content};
    final d = distanceKm;
    if (d != null && d > 0) m['distanceKm'] = d;
    return m;
  }
}

class Comment {
  const Comment({required this.id, required this.content, this.createdAt = '', this.user});
  final String id;
  final String content;
  final String createdAt;
  final FeedUser? user;

  factory Comment.fromJson(Map<String, dynamic> j) => Comment(
        id: (j['id'] as String?) ?? '',
        content: (j['content'] as String?) ?? '',
        createdAt: (j['createdAt'] as String?) ?? '',
        user: j['user'] is Map<String, dynamic> ? FeedUser.fromJson(j['user'] as Map<String, dynamic>) : null,
      );
}
