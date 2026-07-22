import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'notification_models.dart';

/// 消息通知远程数据源：list / markRead / markAllRead / unreadCount。
class NotificationRemote {
  NotificationRemote._();

  static Future<List<AppNotification>> list({
    int page = 1,
    int pageSize = 30,
  }) async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.notificationBase,
      ApiEndpoints.actionNotifList,
      payload: {'page': page, 'pageSize': pageSize},
    );
    final arr = (data['list'] as List?) ?? const [];
    return arr
        .map((e) => AppNotification.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<void> markRead(String id) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.notificationBase,
      ApiEndpoints.actionNotifMarkRead,
      payload: {'id': id},
    );
  }

  static Future<void> markAllRead() async {
    await ApiClient.instance.postAction(
      ApiEndpoints.notificationBase,
      ApiEndpoints.actionNotifMarkAllRead,
    );
  }
}
