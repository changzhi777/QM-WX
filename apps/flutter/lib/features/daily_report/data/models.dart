/// 每日 AI 报告（stats.dailyReportList 项 / dailyReport 单日）。
class DailyReport {
  const DailyReport({
    required this.id,
    required this.date,
    required this.healthScore,
    required this.reportText,
    this.alertText,
    required this.steps,
    this.restingHr,
    this.sleepHours,
  });

  final String id;
  final String date; // YYYY-MM-DD
  final int healthScore; // 0-100
  final String reportText; // AI 解读文本
  final String? alertText; // AI 主动提醒
  final int steps;
  final int? restingHr;
  final double? sleepHours;

  factory DailyReport.fromJson(Map<String, dynamic> j) => DailyReport(
        id: (j['id'] as String?) ?? '',
        date: (j['date'] as String?) ?? '',
        healthScore: (j['healthScore'] as num?)?.toInt() ?? 0,
        reportText: (j['reportText'] as String?) ?? '',
        alertText: j['alertText'] as String?,
        steps: (j['steps'] as num?)?.toInt() ?? 0,
        restingHr: (j['restingHr'] as num?)?.toInt(),
        sleepHours: (j['sleepHours'] as num?)?.toDouble(),
      );
}
