import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../data/models.dart';
import '../data/remote.dart';

/// 我关注的人（tab 0）/ 关注我的人（tab 1）。
final followingProvider =
    AutoDisposeFutureProvider<List<FollowUser>>((ref) => FollowRemote.myFollowing());
final followersProvider =
    AutoDisposeFutureProvider<List<FollowUser>>((ref) => FollowRemote.myFollowers());

/// 关注/粉丝列表页（TabBar 切换）。
class FollowPage extends ConsumerStatefulWidget {
  const FollowPage({super.key, this.initialTab = 0});
  final int initialTab;

  @override
  ConsumerState<FollowPage> createState() => _FollowPageState();
}

class _FollowPageState extends ConsumerState<FollowPage>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(
      length: 2, vsync: this, initialIndex: widget.initialTab.clamp(0, 1));

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('关注'),
        bottom: TabBar(
          controller: _tab,
          tabs: const [Tab(text: '关注'), Tab(text: '粉丝')],
        ),
      ),
      body: TabBarView(controller: _tab, children: [
        _list(ref, followingProvider, '还没有关注的人', c),
        _list(ref, followersProvider, '还没有粉丝', c),
      ]),
    );
  }

  Widget _list(WidgetRef ref, AutoDisposeFutureProvider<List<FollowUser>> provider,
      String empty, ColorScheme c) {
    final async = ref.watch(provider);
    return async.when(
      loading: () => const Center(child: CircularProgressIndicator()),
      error: (e, _) => Center(child: Text('加载失败', style: TextStyle(color: c.error))),
      data: (list) => list.isEmpty
          ? Center(child: Text(empty, style: TextStyle(color: c.outline)))
          : RefreshIndicator(
              onRefresh: () async => ref.invalidate(provider),
              child: ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                itemBuilder: (_, i) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: AppCard(
                    child: ListTile(
                      contentPadding:
                          const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                      leading: CircleAvatar(
                        radius: 20,
                        backgroundColor: c.primaryContainer,
                        backgroundImage:
                            (list[i].user.avatarUrl ?? '').isNotEmpty
                                ? NetworkImage(list[i].user.avatarUrl!)
                                : null,
                        child: (list[i].user.avatarUrl ?? '').isEmpty
                            ? Icon(Icons.person, color: c.onPrimaryContainer)
                            : null,
                      ),
                      title: Text(list[i].user.nickname ?? '跑者'),
                    ),
                  ),
                ),
              ),
            ),
    );
  }
}
