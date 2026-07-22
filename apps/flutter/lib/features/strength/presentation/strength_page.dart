import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design_system/app_card.dart';
import '../data/models.dart';
import '../data/remote.dart';

/// 力量训练历史（进页拉一次，刷新失效）。
final strengthSessionsProvider =
    FutureProvider<List<StrengthSession>>((ref) => StrengthRemote.listSessions());

/// 容量趋势（近 N 天）。
final strengthVolumeProvider =
    FutureProvider<VolumeSummary>((ref) => StrengthRemote.myVolume());

/// 力量训练历史页：容量概览（myVolume）+ 训练列表（listSessions）。
class StrengthPage extends ConsumerWidget {
  const StrengthPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final sessionsAsync = ref.watch(strengthSessionsProvider);
    final volumeAsync = ref.watch(strengthVolumeProvider);
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('力量训练'),
        actions: [
          IconButton(
            tooltip: '刷新',
            icon: const Icon(Icons.refresh),
            onPressed: () {
              ref.invalidate(strengthSessionsProvider);
              ref.invalidate(strengthVolumeProvider);
            },
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 容量概览
          AppCard(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: volumeAsync.when(
                loading: () => const Center(child: CircularProgressIndicator()),
                error: (_, _) =>
                    Text('容量加载失败', style: TextStyle(color: c.error)),
                data: (v) => Row(children: [
                  Expanded(
                      child: _stat(tt, v.totalVolume.toStringAsFixed(0),
                          '近${v.days}天容量 kg')),
                  Expanded(
                      child: _stat(tt, '${v.totalSessions}', '训练次数')),
                ]),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Text('训练历史', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          sessionsAsync.when(
            loading: () => const Center(
                child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator())),
            error: (_, _) =>
                AppCard(child: Text('历史加载失败', style: TextStyle(color: c.error))),
            data: (list) => list.isEmpty
                ? AppCard(
                    child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Center(
                          child: Text('还没有力量训练记录',
                              style: TextStyle(color: c.outline))),
                    ),
                  )
                : Column(
                    children: list
                        .map((s) => Padding(
                              padding: const EdgeInsets.only(bottom: 8),
                              child: AppCard(
                                child: ListTile(
                                  contentPadding:
                                      const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  leading: Icon(Icons.fitness_center, color: c.primary),
                                  title: Text(s.dateStr,
                                      style: tt.bodyLarge
                                          ?.copyWith(fontWeight: FontWeight.bold)),
                                  subtitle: Text(
                                      '${s.setCount} 组 · ${s.durationLabel} · ${s.totalVolume.toStringAsFixed(0)} kg',
                                      style: tt.bodySmall),
                                  trailing: (s.notes ?? '').isNotEmpty
                                      ? Icon(Icons.notes, color: c.outline, size: 18)
                                      : null,
                                ),
                              ),
                            ))
                        .toList(),
                  ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        tooltip: '开始训练',
        onPressed: () async {
          await context.push('/strength/session');
          ref.invalidate(strengthSessionsProvider);
          ref.invalidate(strengthVolumeProvider);
        },
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _stat(TextTheme tt, String value, String label) => Column(children: [
        Text(value,
            style: tt.headlineSmall
                ?.copyWith(fontWeight: FontWeight.bold, color: const Color(0xFF2D9D78))),
        const SizedBox(height: 4),
        Text(label, style: tt.bodySmall, textAlign: TextAlign.center),
      ]);
}
