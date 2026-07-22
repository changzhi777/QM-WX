import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/feed_models.dart';
import '../data/feed_remote.dart';

/// 动态控制器：list + publish（后刷新）+ toggleLike（乐观更新 + 失败回滚）。
class FeedController extends AsyncNotifier<List<Feed>> {
  @override
  Future<List<Feed>> build() async => (await FeedRemote.list()).list;

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async => (await FeedRemote.list()).list);
  }

  Future<void> publish(PublishFeedRequest req) async {
    await FeedRemote.publish(req);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(() async => (await FeedRemote.list()).list);
  }

  /// 点赞切换：乐观更新（liked + likeCount ±1），失败回滚。
  Future<void> toggleLike(Feed feed) async {
    final current = state.valueOrNull;
    if (current == null) return;
    final willLike = !feed.liked;
    final newCount = feed.likeCount + (willLike ? 1 : -1);
    state = AsyncData(current
        .map((f) => f.id == feed.id
            ? f.copyWith(liked: willLike, likeCount: newCount < 0 ? 0 : newCount)
            : f)
        .toList());
    try {
      if (willLike) {
        await FeedRemote.like(feed.id);
      } else {
        await FeedRemote.unlike(feed.id);
      }
    } catch (_) {
      // 回滚
      if (state.valueOrNull != null) {
        state = AsyncData(state.value!
            .map((f) => f.id == feed.id
                ? f.copyWith(liked: feed.liked, likeCount: feed.likeCount)
                : f)
            .toList());
      }
    }
  }
}

final feedProvider =
    AsyncNotifierProvider<FeedController, List<Feed>>(FeedController.new);

/// 评论列表（family by feedId）
final feedCommentsProvider = FutureProvider.family<List<Comment>, String>(
    (ref, feedId) => FeedRemote.listComments(feedId));
