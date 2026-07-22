import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../data/feed_models.dart';
import '../data/feed_remote.dart';
import 'feed_controller.dart';

/// 动态详情：内容 + 点赞/评论数 + 评论列表 + 发评论。
class FeedDetailPage extends ConsumerStatefulWidget {
  const FeedDetailPage({super.key, required this.feed});
  final Feed feed;

  @override
  ConsumerState<FeedDetailPage> createState() => _FeedDetailPageState();
}

class _FeedDetailPageState extends ConsumerState<FeedDetailPage> {
  final _commentCtrl = TextEditingController();
  bool _sending = false;

  @override
  void dispose() {
    _commentCtrl.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _commentCtrl.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() => _sending = true);
    try {
      await FeedRemote.comment(widget.feed.id, text);
      _commentCtrl.clear();
      ref.invalidate(feedCommentsProvider(widget.feed.id));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final feed = widget.feed;
    final commentsAsync = ref.watch(feedCommentsProvider(feed.id));
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(feed.user?.displayName ?? '动态')),
      body: Column(
        children: [
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(16),
              children: [
                // 动态内容卡
                AppCard(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(feed.content, style: tt.bodyMedium),
                    if (feed.distanceKm != null && feed.distanceKm! > 0) ...[
                      const SizedBox(height: 8),
                      Text('${feed.distanceKm!.toStringAsFixed(1)} km', style: tt.bodySmall?.copyWith(color: c.primary)),
                    ],
                    const SizedBox(height: 8),
                    Row(children: [
                      Icon(feed.liked ? Icons.favorite : Icons.favorite_border, color: feed.liked ? Colors.red : c.outline, size: 18),
                      const SizedBox(width: 4),
                      Text('${feed.likeCount}', style: tt.bodySmall),
                      const SizedBox(width: 16),
                      Icon(Icons.chat_bubble_outline, color: c.outline, size: 18),
                      const SizedBox(width: 4),
                      Text('${feed.commentCount}', style: tt.bodySmall),
                    ]),
                  ]),
                ),
                const SizedBox(height: 16),
                Text('评论', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                commentsAsync.when(
                  loading: () => const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
                  error: (_, _) => Text('评论加载失败', style: TextStyle(color: c.error)),
                  data: (list) => list.isEmpty
                      ? AppCard(child: Padding(padding: const EdgeInsets.all(16), child: Center(child: Text('暂无评论，抢沙发', style: TextStyle(color: c.outline)))))
                      : Column(children: list.map((cm) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: AppCard(
                            child: ListTile(
                              contentPadding: const EdgeInsets.symmetric(horizontal: 4),
                              leading: CircleAvatar(radius: 16, backgroundColor: c.primaryContainer, backgroundImage: (cm.user?.avatarUrl ?? '').isNotEmpty ? NetworkImage(cm.user!.avatarUrl!) : null, child: (cm.user?.avatarUrl ?? '').isEmpty ? Icon(Icons.person, size: 16, color: c.onPrimaryContainer) : null),
                              title: Text(cm.user?.displayName ?? '跑者', style: tt.bodySmall?.copyWith(fontWeight: FontWeight.bold)),
                              subtitle: Text(cm.content, style: tt.bodyMedium),
                            ),
                          ),
                        )).toList()),
                ),
              ],
            ),
          ),
          // 发评论 input
          Container(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
            decoration: BoxDecoration(color: c.surface, border: Border(top: BorderSide(color: c.outlineVariant))),
            child: Row(children: [
              Expanded(child: TextField(controller: _commentCtrl, enabled: !_sending, minLines: 1, maxLines: 3, decoration: const InputDecoration(hintText: '写评论...', isDense: true, border: OutlineInputBorder()))),
              const SizedBox(width: 8),
              IconButton.filled(onPressed: _sending ? null : _send, icon: const Icon(Icons.send)),
            ]),
          ),
        ],
      ),
    );
  }
}
