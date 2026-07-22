import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../data/models.dart';
import '../data/remote.dart';

/// 成就证书数据（进页拉一次，下拉/失效刷新）。
final certificatesProvider =
    FutureProvider<CertificateBundle>((ref) => CertificatesRemote.fetch());

/// 成就证书页：总览（累计里程/打卡 + 下一里程碑进度）+ 里程里程碑 + 赛事证书。
class CertificatesPage extends ConsumerWidget {
  const CertificatesPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(certificatesProvider);
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('我的成就'),
        actions: [
          IconButton(
            tooltip: '刷新',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(certificatesProvider),
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
              onPressed: () => ref.invalidate(certificatesProvider),
              child: const Text('重试'),
            ),
          ]),
        ),
        data: (bundle) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(certificatesProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // 总览卡 + 下一目标进度
              AppCard(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(children: [
                    Row(children: [
                      Expanded(child: _stat(tt, bundle.totalDistance.toStringAsFixed(1), '累计 km')),
                      Expanded(child: _stat(tt, '${bundle.totalCheckins}', '打卡次数')),
                    ]),
                    if (bundle.nextMilestone != null) ...[
                      const SizedBox(height: 16),
                      _nextProgress(c, tt, bundle.totalDistance, bundle.nextMilestone!),
                    ] else ...[
                      const SizedBox(height: 12),
                      Text('已达成全部里程里程碑 🎉', style: tt.bodyMedium?.copyWith(color: c.primary)),
                    ],
                  ]),
                ),
              ),
              const SizedBox(height: 16),
              if (bundle.milestones.isNotEmpty) ...[
                Text('里程里程碑', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                ...bundle.milestones.map((m) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _certCard(c, tt,
                          icon: Icons.emoji_events, title: m.title, subtitle: m.desc),
                    )),
              ],
              if (bundle.marathons.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text('赛事证书', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                ...bundle.marathons.map((m) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: _certCard(c, tt,
                          icon: Icons.military_tech,
                          title: m.title,
                          subtitle: '${m.date}${m.location != null ? ' · ${m.location}' : ''}'),
                    )),
              ],
              if (bundle.milestones.isEmpty && bundle.marathons.isEmpty)
                AppCard(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                        child: Text('还没有证书，继续跑起来解锁成就！',
                            style: TextStyle(color: c.outline))),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _stat(TextTheme tt, String value, String label) => Column(children: [
        Text(value,
            style: tt.headlineSmall
                ?.copyWith(fontWeight: FontWeight.bold, color: const Color(0xFF2D9D78))),
        const SizedBox(height: 4),
        Text(label, style: tt.bodySmall),
      ]);

  Widget _nextProgress(
      ColorScheme c, TextTheme tt, double current, MilestoneTarget next) {
    final pct = next.km > 0 ? (current / next.km).clamp(0.0, 1.0) : 0.0;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text('下一目标：${next.title}（${next.km} km）',
          style: tt.bodyMedium?.copyWith(fontWeight: FontWeight.bold)),
      const SizedBox(height: 4),
      Text(next.desc, style: tt.bodySmall?.copyWith(color: c.outline)),
      const SizedBox(height: 8),
      ClipRRect(
        borderRadius: BorderRadius.circular(8),
        child: LinearProgressIndicator(
            value: pct, minHeight: 8, backgroundColor: c.surfaceContainerHighest),
      ),
      const SizedBox(height: 4),
      Text('${current.toStringAsFixed(1)} / ${next.km} km',
          style: tt.bodySmall?.copyWith(color: c.outline)),
    ]);
  }

  Widget _certCard(ColorScheme c, TextTheme tt,
          {required IconData icon, required String title, required String subtitle}) =>
      AppCard(
        child: ListTile(
          contentPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          leading: Icon(icon, color: const Color(0xFFF5A623), size: 32),
          title: Text(title, style: tt.bodyLarge?.copyWith(fontWeight: FontWeight.bold)),
          subtitle: Text(subtitle, style: tt.bodySmall),
        ),
      );
}
