import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../data/shoe_models.dart';
import 'shoes_controller.dart';

/// 跑鞋详情：鞋卡（里程进度+健康色+统计）+ 月度里程柱图。
class ShoesDetailPage extends ConsumerWidget {
  const ShoesDetailPage({super.key, required this.shoeId});
  final String shoeId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(shoeDetailProvider(shoeId));
    final mileageAsync = ref.watch(mileageHistoryProvider(shoeId));
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('跑鞋详情')),
      body: detailAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('加载失败', style: TextStyle(color: c.error))),
        data: (d) => RefreshIndicator(
          onRefresh: () async {
            ref.invalidate(shoeDetailProvider(shoeId));
            ref.invalidate(mileageHistoryProvider(shoeId));
          },
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // 鞋卡
              AppCard(
                title: d.displayName,
                icon: d.isRetired ? Icons.block : Icons.directions_run,
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('${d.brand} ${d.model}', style: tt.bodySmall?.copyWith(color: c.outline)),
                  const SizedBox(height: 12),
                  // 里程进度条
                  ClipRRect(
                    borderRadius: BorderRadius.circular(4),
                    child: LinearProgressIndicator(
                      value: d.progress.clamp(0.0, 1.0),
                      minHeight: 10,
                      backgroundColor: c.surfaceContainerHighest,
                      valueColor: AlwaysStoppedAnimation(_healthColor(d.healthRatio, c)),
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text('${d.currentKm.toStringAsFixed(0)} / ${d.thresholdKm.toStringAsFixed(0)} km', style: tt.bodySmall?.copyWith(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 12),
                  // 统计 4 格
                  Row(children: [
                    _stat('${d.totalCheckins}', '打卡次', tt, c),
                    const SizedBox(width: 8),
                    _stat('${d.daysSincePurchase ?? 0}', '持有天', tt, c),
                    const SizedBox(width: 8),
                    _stat(d.latestCheckinAt != null && d.latestCheckinAt!.length >= 10 ? d.latestCheckinAt!.substring(0, 10) : '-', '最近打卡', tt, c),
                    const SizedBox(width: 8),
                    _stat(d.isRetired ? '退役' : '在用', '状态', tt, c),
                  ]),
                ]),
              ),
              const SizedBox(height: 16),
              Text('月度里程', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              mileageAsync.when(
                loading: () => const Padding(padding: EdgeInsets.all(24), child: Center(child: CircularProgressIndicator())),
                error: (_, _) => Text('里程数据加载失败', style: TextStyle(color: c.error, fontSize: 13)),
                data: (m) => m.monthly.isEmpty
                    ? AppCard(child: Padding(padding: const EdgeInsets.all(16), child: Center(child: Text('暂无里程记录', style: TextStyle(color: c.outline)))))
                    : AppCard(child: _MileageChart(points: m.monthly, color: c.primary)),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Color _healthColor(double? ratio, ColorScheme c) {
    if (ratio == null) return c.primary;
    if (ratio < 70) return Colors.green;
    if (ratio <= 100) return Colors.orange;
    return Colors.red;
  }

  Widget _stat(String v, String l, TextTheme tt, ColorScheme c) => Expanded(
        child: Column(children: [
          Text(v, style: tt.bodyMedium?.copyWith(fontWeight: FontWeight.bold, color: c.primary)),
          const SizedBox(height: 2),
          Text(l, style: tt.bodySmall?.copyWith(color: c.outline, fontSize: 11)),
        ]),
      );
}

/// 月度里程柱图（复用 insight 批 4 Container 柱范式）
class _MileageChart extends StatelessWidget {
  const _MileageChart({required this.points, required this.color});
  final List<MileagePoint> points;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final maxKm = points.fold<double>(0, (m, e) => e.km > m ? e.km : m);
    final c = Theme.of(context).colorScheme;
    return SizedBox(
      height: 120,
      child: points.length < 2
          ? Center(child: Text('数据不足', style: TextStyle(color: c.outline)))
          : Row(
              crossAxisAlignment: CrossAxisAlignment.end,
              children: points.map((p) {
                final ratio = maxKm > 0 ? p.km / maxKm : 0.0;
                return Expanded(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 2),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.end,
                      children: [
                        if (p.km > 0) Text(p.km.toStringAsFixed(0), style: TextStyle(fontSize: 8, color: c.outline)),
                        const SizedBox(height: 2),
                        Container(
                          height: ratio * 80,
                          width: double.infinity,
                          decoration: BoxDecoration(
                            color: color.withValues(alpha: 0.3 + 0.7 * ratio),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(p.date.length >= 7 ? p.date.substring(5, 7) : p.date, style: TextStyle(fontSize: 8, color: c.outline)),
                      ],
                    ),
                  ),
                );
              }).toList(),
            ),
    );
  }
}
