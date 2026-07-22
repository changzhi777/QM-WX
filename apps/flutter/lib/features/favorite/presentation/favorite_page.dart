import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../data/models.dart';
import '../data/remote.dart';

/// 我的收藏（进页拉一次，下拉刷新）。
final favoritesProvider =
    FutureProvider<List<FavoriteItem>>((ref) => FavoriteRemote.list());

/// 收藏列表页：赛事/商品收藏（图标 + 标题 + 类型标签，已删除灰显）。
class FavoritePage extends ConsumerWidget {
  const FavoritePage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(favoritesProvider);
    final c = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('我的收藏'),
        actions: [
          IconButton(
            tooltip: '刷新',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(favoritesProvider),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('加载失败', style: TextStyle(color: c.error)),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () => ref.invalidate(favoritesProvider),
              child: const Text('重试'),
            ),
          ]),
        ),
        data: (list) => list.isEmpty
            ? Center(
                child: Text('还没有收藏',
                    style: TextStyle(color: c.outline)))
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(favoritesProvider),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final f = list[i];
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: AppCard(
                        child: Opacity(
                          opacity: f.deleted ? 0.45 : 1.0,
                          child: ListTile(
                            contentPadding:
                                const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                            leading: (f.cover ?? '').isNotEmpty
                                ? ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: Image.network(f.cover!,
                                        width: 48, height: 48, fit: BoxFit.cover,
                                        errorBuilder: (_, _, _) => Icon(
                                            f.targetType == 'content'
                                                ? Icons.event
                                                : Icons.shopping_bag_outlined,
                                            color: c.primary)))
                                : Icon(
                                    f.targetType == 'content'
                                        ? Icons.event
                                        : Icons.shopping_bag_outlined,
                                    color: c.primary),
                            title: Text(f.title, style: const TextStyle(fontWeight: FontWeight.bold)),
                            trailing: Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                  color: c.tertiaryContainer,
                                  borderRadius: BorderRadius.circular(8)),
                              child: Text(f.typeLabel,
                                  style: TextStyle(fontSize: 11, color: c.onTertiaryContainer)),
                            ),
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
      ),
    );
  }
}
