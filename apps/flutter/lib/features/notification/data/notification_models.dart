import 'package:flutter/material.dart';

// 消息通知模型（与后端 notification.list 对齐）。

class NotifActor {
  const NotifActor({required this.id, this.nickname, this.avatarUrl});
  final String id;
  final String? nickname;
  final String? avatarUrl;

  factory NotifActor.fromJson(Map<String, dynamic> j) => NotifActor(
        id: (j['id'] as String?) ?? '',
        nickname: j['nickname'] as String?,
        avatarUrl: j['avatarUrl'] as String?,
      );

  String get displayName => (nickname ?? '').isNotEmpty ? nickname! : '跑者';
}

class AppNotification {
  const AppNotification({
    required this.id,
    required this.type,
    this.targetType,
    this.targetId,
    this.content,
    this.isRead = false,
    this.createdAt = '',
    this.actor,
  });

  final String id;
  final String type; // like / comment / follow / system
  final String? targetType;
  final String? targetId;
  final String? content;
  final bool isRead;
  final String createdAt;
  final NotifActor? actor;

  factory AppNotification.fromJson(Map<String, dynamic> j) => AppNotification(
        id: (j['id'] as String?) ?? '',
        type: (j['type'] as String?) ?? 'system',
        targetType: j['targetType'] as String?,
        targetId: j['targetId'] as String?,
        content: j['content'] as String?,
        isRead: (j['isRead'] as bool?) ?? false,
        createdAt: (j['createdAt'] as String?) ?? '',
        actor: j['actor'] is Map<String, dynamic>
            ? NotifActor.fromJson(j['actor'] as Map<String, dynamic>)
            : null,
      );

  AppNotification copyWith({bool? isRead}) => AppNotification(
        id: id,
        type: type,
        targetType: targetType,
        targetId: targetId,
        content: content,
        isRead: isRead ?? this.isRead,
        createdAt: createdAt,
        actor: actor,
      );

  IconData get icon => switch (type) {
        'like' => Icons.favorite,
        'comment' => Icons.chat_bubble_outline,
        'follow' => Icons.person_add_alt_outlined,
        _ => Icons.notifications_active_outlined,
      };

  String get label => switch (type) {
        'like' => '赞了你的动态',
        'comment' => '评论了你',
        'follow' => '关注了你',
        _ => '系统通知',
      };

  /// 日期（YYYY-MM-DD）
  String get dateLabel =>
      createdAt.length >= 10 ? createdAt.substring(0, 10) : '';
}
