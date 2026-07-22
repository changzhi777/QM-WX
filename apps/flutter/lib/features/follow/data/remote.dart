import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'models.dart';

/// 关注远程数据源：myFollowing（我关注的人）+ myFollowers（关注我的人）+ myCounts（计数）。
class FollowRemote {
  FollowRemote._();

  static Future<List<FollowUser>> myFollowing() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.followBase,
      ApiEndpoints.actionFollowMyFollowing,
      payload: {'page': 1, 'pageSize': 50},
    );
    final list = (data['list'] as List?) ?? const [];
    return list.map((e) => FollowUser.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<List<FollowUser>> myFollowers() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.followBase,
      ApiEndpoints.actionFollowMyFollowers,
      payload: {'page': 1, 'pageSize': 50},
    );
    final list = (data['list'] as List?) ?? const [];
    return list.map((e) => FollowUser.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<FollowCounts> myCounts() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.followBase,
      ApiEndpoints.actionFollowMyCounts,
    );
    return FollowCounts.fromJson(data);
  }
}
