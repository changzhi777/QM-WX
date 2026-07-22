import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../data/insight_models.dart';
import 'insight_controller.dart';

/// 数据解读 tab：年度统计 + 月度跑量柱状图（Container 简易）+ 用户画像。
///
/// 4-tab 最后一个占位消灭。无 fl_chart 依赖（Container 按比例画柱）。
class InsightPage extends ConsumerWidget {
  const InsightPage({super.key});

  String _formatPace(int? sec) {
    if (sec == null || sec <= 0) return "--";
    final m = sec ~/ 60;
    final s = sec % 60;
    return "$m'${s.toString().padLeft(2, '0')}\"";
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(insightProvider);
    final c = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('数据解读'),
        actions: [
          IconButton(
              tooltip: '刷新',
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.read(insightProvider.notifier).refresh()),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (_, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('加载失败', style: TextStyle(color: c.error)),
              const SizedBox(height: 8),
              FilledButton(
                  onPressed: () => ref.read(insightProvider.notifier).refresh(),
                  child: const Text('重试')),
            ],
          ),
        ),
        data: (d) => RefreshIndicator(
          onRefresh: () => ref.read(insightProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (d.annual != null) ...[
                _yearStats(context, d.annual!),
                const SizedBox(height: 16),
                AppCard(
                  title: '${d.annual!.year}年月度跑量',
                  icon: Icons.bar_chart,
                  child: _monthChart(d.annual!.monthly, c),
                ),
                const SizedBox(height: 16),
              ],
              if (d.profile != null && d.profile!.summary.isNotEmpty)
                AppCard(
                  title: '用户画像',
                  icon: Icons.person_outline,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(d.profile!.summary,
                          style: Theme.of(context).textTheme.bodyMedium),
                      if (d.profile!.tags.isNotEmpty) ...[
                        const SizedBox(height: 8),
                        Wrap(
                          spacing: 6,
                          children: d.profile!.tags
                              .map((t) => Chip(
                                    label: Text(t),
                                    visualDensity: VisualDensity.compact,
                                  ))
                              .toList(),
                        ),
                      ],
                    ],
                  ),
                ),
              if (d.annual == null &&
                  (d.profile == null || d.profile!.summary.isEmpty))
                Padding(
                  padding: const EdgeInsets.all(24),
                  child: Center(
                      child: Text('暂无数据，去运动生成解读',
                          style: TextStyle(color: c.outline))),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _yearStats(BuildContext context, AnnualReport a) {
    final tt = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    Widget stat(String v, String l) => Expanded(
          child: Container(
            padding: const EdgeInsets.symmetric(vertical: 12),
            decoration: BoxDecoration(
                color: c.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(12)),
            child: Column(
              children: [
                Text(v,
                    style: tt.titleLarge
                        ?.copyWith(fontWeight: FontWeight.bold, color: c.primary)),
                const SizedBox(height: 2),
                Text(l, style: tt.bodySmall?.copyWith(color: c.outline)),
              ],
            ),
          ),
        );
    return Row(
      children: [
        stat(a.yearDistance.toStringAsFixed(0), '年跑量km'),
        const SizedBox(width: 8),
        stat('${a.yearCheckins}', '打卡次'),
        const SizedBox(width: 8),
        stat(_formatPace(a.avgPaceSec), '均配速'),
        const SizedBox(width: 8),
        stat('${a.activeDays}', '活跃天'),
      ],
    );
  }

  /// 月度柱状图：12 柱 Container 按比例（最大柱 90px），颜色深度随跑量。
  Widget _monthChart(List<MonthlyDistance> monthly, ColorScheme c) {
    final maxDist =
        monthly.fold<double>(0, (m, e) => e.distance > m ? e.distance : m);
    return SizedBox(
      height: 130,
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: monthly.map((m) {
          final ratio = maxDist > 0 ? m.distance / maxDist : 0.0;
          return Expanded(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 1.5),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.end,
                children: [
                  if (m.distance > 0)
                    Text(m.distance.toStringAsFixed(0),
                        style: TextStyle(fontSize: 8, color: c.outline)),
                  const SizedBox(height: 2),
                  Container(
                    height: ratio * 90,
                    width: double.infinity,
                    decoration: BoxDecoration(
                        color:
                            c.primary.withValues(alpha: 0.3 + 0.7 * ratio),
                        borderRadius: BorderRadius.circular(2)),
                  ),
                  const SizedBox(height: 2),
                  Text('${m.month}',
                      style: TextStyle(fontSize: 8, color: c.outline)),
                ],
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
