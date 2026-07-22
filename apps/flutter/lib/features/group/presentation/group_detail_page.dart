import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../data/group_models.dart';
import 'group_controller.dart';

/// 群详情：群卡 + 汇总 + 公告 + 成员跑量榜。
class GroupDetailPage extends ConsumerWidget {
  const GroupDetailPage({super.key, required this.groupId});
  final String groupId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(groupDetailProvider(groupId));
    final rankAsync = ref.watch(groupRankingProvider(groupId));
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('群详情')),
      body: detailAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('加载失败: $e', style: TextStyle(color: c.error))),
        data: (d) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(groupDetailProvider(groupId));
            ref.invalidate(groupRankingProvider(groupId));
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // 群卡 + 汇总
              AppCard(
                title: d.name,
                icon: Icons.groups,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('群主：${d.owner?.displayName ?? "—"}', style: tt.bodySmall?.copyWith(color: c.outline)),
                  const SizedBox(height: 8),
                  Row(children: [
                    _stat(d.totalDistance.toStringAsFixed(0), '总跑量km', tt, c),
                    const SizedBox(width: 12),
                    _stat(d.totalCheckins.toString(), '总打卡', tt, c),
                    const SizedBox(width: 12),
                    _stat(d.activeDays.toString(), '活跃天', tt, c),
                    const SizedBox(width: 12),
                    _stat(d.memberCount.toString(), '成员', tt, c),
                  ]),
                  if ((d.announce ?? '').isNotEmpty) ...[
                    const SizedBox(height: 12),
                    Container(padding: const EdgeInsets.all(10), decoration: BoxDecoration(color: c.surfaceContainerHighest, borderRadius: BorderRadius.circular(8)), child: Text('📢 ${d.announce}', style: tt.bodySmall)),
                  ],
                ]),
              ),
              const SizedBox(height: 16),
              Text('成员跑量榜（本周）', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              rankAsync.when(
                loading: () => const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
                error: (e, _) => Text('榜单加载失败', style: TextStyle(color: c.error, fontSize: 13)),
                data: (list) => list.isEmpty
                    ? AppCard(child: Padding(padding: const EdgeInsets.all(16), child: Center(child: Text('本周暂无打卡', style: TextStyle(color: c.outline)))))
                    : Column(children: list.asMap().entries.map((e) => _RankTile(rank: e.key + 1, entry: e.value)).toList()),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _stat(String v, String l, TextTheme tt, ColorScheme c) => Expanded(
        child: Column(children: [
          Text(v, style: tt.titleMedium?.copyWith(fontWeight: FontWeight.bold, color: c.primary)),
          const SizedBox(height: 2),
          Text(l, style: tt.bodySmall?.copyWith(color: c.outline, fontSize: 11)),
        ]),
      );
}

class _RankTile extends StatelessWidget {
  const _RankTile({required this.rank, required this.entry});
  final int rank;
  final GroupRankEntry entry;

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    final medal = rank == 1 ? '🥇' : rank == 2 ? '🥈' : rank == 3 ? '🥉' : '$rank';
    return AppCard(
      child: ListTile(
        contentPadding: const EdgeInsets.symmetric(horizontal: 4),
        leading: CircleAvatar(radius: 18, backgroundColor: c.primaryContainer, backgroundImage: (entry.avatarUrl ?? '').isNotEmpty ? NetworkImage(entry.avatarUrl!) : null, child: (entry.avatarUrl ?? '').isEmpty ? Text(medal, style: const TextStyle(fontSize: 14)) : null),
        title: Text(entry.displayName, style: tt.bodyMedium?.copyWith(fontWeight: FontWeight.bold)),
        subtitle: Text('${entry.distance.toStringAsFixed(1)} km · ${entry.count} 次 · ${entry.points} 分', style: tt.bodySmall?.copyWith(color: c.outline)),
        trailing: rank <= 3 ? null : Text('#$rank', style: tt.bodySmall?.copyWith(color: c.outline)),
      ),
    );
  }
}
