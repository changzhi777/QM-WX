import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/notification_models.dart';
import '../data/notification_remote.dart';

/// 消息控制器：list + markRead（局部）+ markAllRead（局部）。
class NotificationController extends AsyncNotifier<List<AppNotification>> {
  @override
  Future<List<AppNotification>> build() => NotificationRemote.list();

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(NotificationRemote.list);
  }

  /// 标记单条已读：乐观更新（失败不回滚，下次刷新纠正）。
  Future<void> markRead(AppNotification n) async {
    if (n.isRead) return;
    final current = state.valueOrNull;
    if (current == null) return;
    state = AsyncData(current
        .map((x) => x.id == n.id ? x.copyWith(isRead: true) : x)
        .toList());
    try {
      await NotificationRemote.markRead(n.id);
    } catch (_) {
      // 静默：下次刷新纠正
    }
  }

  /// 全部已读：乐观更新。
  Future<void> markAllRead() async {
    final current = state.valueOrNull;
    if (current == null) return;
    state = AsyncData(current.map((x) => x.copyWith(isRead: true)).toList());
    try {
      await NotificationRemote.markAllRead();
    } catch (_) {
      // 静默
    }
  }
}

final notificationProvider = AsyncNotifierProvider<NotificationController,
    List<AppNotification>>(NotificationController.new);
