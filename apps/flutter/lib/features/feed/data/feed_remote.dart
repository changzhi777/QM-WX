import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'feed_models.dart';

/// 运动动态远程数据源：list / publish / like / unlike。
class FeedRemote {
  FeedRemote._();

  /// 列表：page/pageSize/sort → {list, total}
  static Future<({List<Feed> list, int total})> list({
    int page = 1,
    int pageSize = 20,
    String sort = 'new',
  }) async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.feedBase,
      ApiEndpoints.actionFeedList,
      payload: {'page': page, 'pageSize': pageSize, 'sort': sort},
    );
    final arr = (data['list'] as List?) ?? const [];
    final feeds = arr
        .map((e) => Feed.fromJson(e as Map<String, dynamic>))
        .toList();
    final total = (data['total'] as num?)?.toInt() ?? 0;
    return (list: feeds, total: total);
  }

  static Future<void> publish(PublishFeedRequest req) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.feedBase,
      ApiEndpoints.actionFeedPublish,
      payload: req.toJson(),
    );
  }

  static Future<void> like(String feedId) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.feedBase,
      ApiEndpoints.actionFeedLike,
      payload: {'feedId': feedId},
    );
  }

  static Future<void> unlike(String feedId) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.feedBase,
      ApiEndpoints.actionFeedUnlike,
      payload: {'feedId': feedId},
    );
  }

  static Future<List<Comment>> listComments(String feedId) async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.feedBase,
      ApiEndpoints.actionFeedListComments,
      payload: {'feedId': feedId},
    );
    final arr = (data['list'] as List?) ?? const [];
    return arr.map((e) => Comment.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<void> comment(String feedId, String content) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.feedBase,
      ApiEndpoints.actionFeedComment,
      payload: {'feedId': feedId, 'content': content},
    );
  }
}
