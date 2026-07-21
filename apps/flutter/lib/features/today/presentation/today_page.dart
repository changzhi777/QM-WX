import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design_system/app_card.dart';
import 'today_controller.dart';

/// 今日页：问候 + 健康分数环 + AI 简报卡 + 3 数据卡 + 天气卡 + 打卡 FAB。
///
/// 批 2 MVP：数据走 stats.healthScore/dailyReport/weather；
/// 打卡 FAB 批 3 接 checkin 表单，批 2 占位。
class TodayPage extends ConsumerWidget {
  const TodayPage({super.key});

  String _greeting() {
    final h = DateTime.now().hour;
    if (h < 6) return '凌晨好';
    if (h < 12) return '早上好';
    if (h < 18) return '下午好';
    return '晚上好';
  }

  String _dateLabel(String? date) {
    if (date != null && date.isNotEmpty) return date;
    final n = DateTime.now();
    final m = n.month.toString().padLeft(2, '0');
    final d = n.day.toString().padLeft(2, '0');
    return '${n.year}-$m-$d';
  }

  /// AI 简报摘要：取前 2 句
  String _reportSummary(String text) {
    if (text.isEmpty) return '今日还没有 AI 简报，运动后自动生成';
    final s = text
        .split(RegExp(r'[。！？\n]'))
        .map((e) => e.trim())
        .where((e) => e.isNotEmpty)
        .toList();
    if (s.isEmpty) return text;
    return '${s.take(2).join('。')}。';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(todayProvider);
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final weekday = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
        [DateTime.now().weekday - 1];

    return Scaffold(
      appBar: AppBar(
        title: const Text('沐禾健康'),
        centerTitle: false,
        actions: [
          IconButton(
            tooltip: 'GPS 跑步',
            icon: const Icon(Icons.directions_run),
            onPressed: () => context.push('/track'),
          ),
          IconButton(
            tooltip: '刷新',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.read(todayProvider.notifier).refresh(),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('加载失败'),
              const SizedBox(height: 8),
              FilledButton(
                onPressed: () => ref.read(todayProvider.notifier).refresh(),
                child: const Text('重试'),
              ),
            ],
          ),
        ),
        data: (data) => RefreshIndicator(
          onRefresh: () => ref.read(todayProvider.notifier).refresh(),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 96),
            children: [
              Text(_greeting(),
                  style: tt.headlineSmall
                      ?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 2),
              Text('${_dateLabel(data.score?.date)} $weekday',
                  style: tt.bodySmall?.copyWith(color: c.outline)),
              const SizedBox(height: 16),
              _ScoreRing(
                  score: data.score?.score ?? 0,
                  diff: data.score?.trend?.diff,
                  color: c.primary),
              const SizedBox(height: 16),
              AppCard(
                title: 'AI 今日简报',
                icon: Icons.auto_awesome_outlined,
                child: Text(_reportSummary(data.report?.reportText ?? ''),
                    style: tt.bodyMedium),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(
                      child: _MetricTile(
                          icon: Icons.directions_walk,
                          label: '步数',
                          value: '${data.score?.steps ?? data.report?.steps ?? 0}',
                          unit: '步')),
                  const SizedBox(width: 12),
                  Expanded(
                      child: _MetricTile(
                          icon: Icons.favorite_outline,
                          label: '静息心率',
                          value:
                              '${data.score?.restingHr ?? data.report?.restingHr ?? '--'}',
                          unit: 'bpm')),
                  const SizedBox(width: 12),
                  Expanded(
                      child: _MetricTile(
                          icon: Icons.bedtime_outlined,
                          label: '睡眠',
                          value:
                              '${data.score?.sleepHours ?? data.report?.sleepHours ?? '--'}',
                          unit: 'h')),
                ],
              ),
              const SizedBox(height: 16),
              if (data.weather != null)
                AppCard(
                  icon: Icons.cloud_outlined,
                  title: data.weather!.city.isEmpty ? '天气' : data.weather!.city,
                  child: Row(
                    children: [
                      if (data.weather!.icon.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(right: 12),
                          child: Text(data.weather!.icon,
                              style: const TextStyle(fontSize: 34)),
                        ),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(
                                '${data.weather!.text}  ${data.weather!.temperature}°',
                                style: tt.titleMedium),
                            const SizedBox(height: 2),
                            Text(
                                '体感 ${data.weather!.feelsLike}° · 湿度 ${data.weather!.humidity}%',
                                style: tt.bodySmall
                                    ?.copyWith(color: c.outline)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => context.push('/checkin'),
        icon: const Icon(Icons.directions_run),
        label: const Text('打卡'),
      ),
    );
  }
}

/// 健康分数环（CircularProgressIndicator + 中间分数 + 趋势）。
class _ScoreRing extends StatelessWidget {
  const _ScoreRing({required this.score, this.diff, required this.color});
  final int score;
  final int? diff;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final up = (diff ?? 0) >= 0;
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            width: 148,
            height: 148,
            child: Stack(
              alignment: Alignment.center,
              children: [
                CircularProgressIndicator(
                  value: (score / 100).clamp(0, 1),
                  strokeWidth: 12,
                  backgroundColor: color.withValues(alpha: 0.12),
                  valueColor: AlwaysStoppedAnimation(color),
                ),
                Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text('$score',
                        style: tt.displaySmall
                            ?.copyWith(fontWeight: FontWeight.bold, color: color)),
                    Text('健康分', style: tt.bodySmall),
                  ],
                ),
              ],
            ),
          ),
          if (diff != null) ...[
            const SizedBox(height: 8),
            Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(up ? Icons.trending_up : Icons.trending_down,
                    size: 16, color: up ? Colors.green : Colors.orange),
                const SizedBox(width: 4),
                Text('较昨日 ${up ? '+' : ''}$diff', style: tt.bodySmall),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

/// 小数据格（步数/心率/睡眠）。
class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.icon,
    required this.label,
    required this.value,
    required this.unit,
  });
  final IconData icon;
  final String label;
  final String value;
  final String unit;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14, horizontal: 8),
      decoration: BoxDecoration(
        color: c.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(icon, color: c.primary),
          const SizedBox(height: 6),
          Text(value,
              style: tt.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 2),
          Text('$label($unit)',
              style: tt.bodySmall?.copyWith(color: c.outline)),
        ],
      ),
    );
  }
}
