import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../data/models.dart';
import '../data/remote.dart';

/// 每日报告历史（进页拉一次，下拉刷新）。
final dailyReportsProvider =
    FutureProvider<List<DailyReport>>((ref) => DailyReportRemote.list());

/// 每日 AI 报告历史页：按日倒序列表（健康分环 + 步数/心率/睡眠 + AI 解读，点击展开全文）。
class DailyReportPage extends ConsumerWidget {
  const DailyReportPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(dailyReportsProvider);
    final c = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('每日报告'),
        actions: [
          IconButton(
            tooltip: '刷新',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(dailyReportsProvider),
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
              onPressed: () => ref.invalidate(dailyReportsProvider),
              child: const Text('重试'),
            ),
          ]),
        ),
        data: (list) => list.isEmpty
            ? ListView(padding: const EdgeInsets.all(16), children: [
                AppCard(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                        child: Text('还没有历史报告，运动后自动生成',
                            style: TextStyle(color: c.outline))),
                  ),
                ),
              ])
            : RefreshIndicator(
                onRefresh: () async => ref.invalidate(dailyReportsProvider),
                child: ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  itemBuilder: (_, i) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: _ReportCard(report: list[i]),
                  ),
                ),
              ),
      ),
    );
  }
}

class _ReportCard extends StatelessWidget {
  const _ReportCard({required this.report});
  final DailyReport report;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return AppCard(
      child: ExpansionTile(
        tilePadding: const EdgeInsets.symmetric(horizontal: 8),
        childrenPadding: const EdgeInsets.fromLTRB(8, 0, 8, 8),
        leading: SizedBox(
          width: 44,
          height: 44,
          child: Stack(alignment: Alignment.center, children: [
            CircularProgressIndicator(
              value: report.healthScore / 100,
              strokeWidth: 4,
              backgroundColor: c.surfaceContainerHighest,
              color: const Color(0xFF2D9D78),
            ),
            Text('${report.healthScore}',
                style: tt.bodySmall?.copyWith(fontWeight: FontWeight.bold)),
          ]),
        ),
        title: Text(report.date, style: tt.bodyLarge?.copyWith(fontWeight: FontWeight.bold)),
        subtitle: Text(
          [
            '${report.steps} 步',
            if (report.restingHr != null) '${report.restingHr} bpm',
            if (report.sleepHours != null) '${report.sleepHours!.toStringAsFixed(1)} h 睡眠',
          ].join(' · '),
          style: tt.bodySmall,
        ),
        children: [
          if (report.alertText != null && report.alertText!.isNotEmpty)
            Container(
              width: double.infinity,
              margin: const EdgeInsets.only(bottom: 8),
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                  color: c.errorContainer, borderRadius: BorderRadius.circular(8)),
              child: Text(report.alertText!, style: tt.bodySmall),
            ),
          Text(report.reportText, style: tt.bodyMedium),
        ],
      ),
    );
  }
}
