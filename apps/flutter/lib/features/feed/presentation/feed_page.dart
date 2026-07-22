import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../data/feed_models.dart';
import 'feed_controller.dart';

/// 运动动态：列表（作者/内容/距离/点赞/评论）+ 点赞（乐观）+ 发布（Dialog）。
class FeedPage extends ConsumerWidget {
  const FeedPage({super.key});

  Future<void> _publish(BuildContext context, WidgetRef ref) async {
    final result = await showDialog<PublishFeedRequest>(
      context: context,
      builder: (_) => const _PublishDialog(),
    );
    if (result == null) return;
    try {
      await ref.read(feedProvider.notifier).publish(result);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('已发布')));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(feedProvider);
    final c = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('运动动态'),
        actions: [
          IconButton(
              tooltip: '刷新',
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.read(feedProvider.notifier).refresh()),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('加载失败', style: TextStyle(color: c.error)),
              const SizedBox(height: 8),
              FilledButton(
                  onPressed: () => ref.read(feedProvider.notifier).refresh(),
                  child: const Text('重试')),
            ],
          ),
        ),
        data: (feeds) => feeds.isEmpty
            ? ListView(padding: const EdgeInsets.all(16), children: [
                AppCard(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                        child: Text('还没有动态，点 + 发布',
                            style: TextStyle(color: c.outline))),
                  ),
                ),
              ])
            : RefreshIndicator(
                onRefresh: () => ref.read(feedProvider.notifier).refresh(),
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: feeds
                      .map((f) => Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: _FeedCard(feed: f)))
                      .toList(),
                ),
              ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _publish(context, ref),
        child: const Icon(Icons.edit),
      ),
    );
  }
}

class _FeedCard extends ConsumerWidget {
  const _FeedCard({required this.feed});
  final Feed feed;

  String get _time =>
      feed.createdAt.length >= 10 ? feed.createdAt.substring(0, 10) : '';

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tt = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              CircleAvatar(
                radius: 16,
                backgroundColor: c.primaryContainer,
                backgroundImage: (feed.user?.avatarUrl ?? '').isNotEmpty
                    ? NetworkImage(feed.user!.avatarUrl!)
                    : null,
                child: (feed.user?.avatarUrl ?? '').isEmpty
                    ? Icon(Icons.person, size: 16, color: c.onPrimaryContainer)
                    : null,
              ),
              const SizedBox(width: 8),
              Expanded(
                  child: Text(feed.user?.displayName ?? '跑者',
                      style: tt.bodyMedium
                          ?.copyWith(fontWeight: FontWeight.bold))),
              if (_time.isNotEmpty)
                Text(_time, style: tt.bodySmall?.copyWith(color: c.outline)),
            ],
          ),
          if ((feed.topic ?? '').isNotEmpty) ...[
            const SizedBox(height: 6),
            Text('#${feed.topic}',
                style: tt.bodySmall?.copyWith(color: c.primary)),
          ],
          const SizedBox(height: 8),
          Text(feed.content, style: tt.bodyMedium),
          if (feed.distanceKm != null && feed.distanceKm! > 0) ...[
            const SizedBox(height: 8),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                  color: c.tertiaryContainer,
                  borderRadius: BorderRadius.circular(8)),
              child: Text('${feed.distanceKm!.toStringAsFixed(1)} km',
                  style: TextStyle(fontSize: 11, color: c.onTertiaryContainer)),
            ),
          ],
          const SizedBox(height: 8),
          Row(
            children: [
              IconButton(
                icon: Icon(
                    feed.liked ? Icons.favorite : Icons.favorite_border,
                    color: feed.liked ? Colors.red : c.outline,
                    size: 20),
                padding: EdgeInsets.zero,
                constraints: const BoxConstraints(),
                onPressed: () =>
                    ref.read(feedProvider.notifier).toggleLike(feed),
              ),
              const SizedBox(width: 4),
              Text('${feed.likeCount}', style: tt.bodySmall),
              const SizedBox(width: 16),
              Icon(Icons.chat_bubble_outline, color: c.outline, size: 20),
              const SizedBox(width: 4),
              Text('${feed.commentCount}', style: tt.bodySmall),
            ],
          ),
        ],
      ),
    );
  }
}

class _PublishDialog extends StatefulWidget {
  const _PublishDialog();
  @override
  State<_PublishDialog> createState() => _PublishDialogState();
}

class _PublishDialogState extends State<_PublishDialog> {
  final _content = TextEditingController();
  final _distance = TextEditingController();

  @override
  void dispose() {
    _content.dispose();
    _distance.dispose();
    super.dispose();
  }

  void _submit() {
    final text = _content.text.trim();
    if (text.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('说点什么吧')));
      return;
    }
    final d = double.tryParse(_distance.text.trim());
    Navigator.of(context).pop(PublishFeedRequest(content: text, distanceKm: d));
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('发布动态'),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                  controller: _content,
                  maxLines: 4,
                  decoration: const InputDecoration(
                      labelText: '分享你的运动时刻…',
                      border: OutlineInputBorder(),
                      alignLabelWithHint: true)),
              const SizedBox(height: 12),
              TextField(
                  controller: _distance,
                  keyboardType:
                      const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                      labelText: '跑步距离 km（选填）',
                      border: OutlineInputBorder())),
            ],
          ),
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('取消')),
          FilledButton(onPressed: _submit, child: const Text('发布')),
        ],
      );
}
