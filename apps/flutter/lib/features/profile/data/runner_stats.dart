// 跑者统计模型（与后端 stats.myRunnerStats 对齐）。

class RunnerStats {
  const RunnerStats({
    this.totalDistance = 0,
    this.totalCheckins = 0,
    this.yearDistance = 0,
    this.yearCheckins = 0,
    this.avgPaceSec,
  });

  final double totalDistance; // 累计 km
  final int totalCheckins; // 累计打卡数
  final double yearDistance; // 今年 km
  final int yearCheckins; // 今年打卡数
  final int? avgPaceSec; // 平均配速 秒/km（distance 0 时后端返 null）

  factory RunnerStats.fromJson(Map<String, dynamic> j) => RunnerStats(
        totalDistance: (j['totalDistance'] as num?)?.toDouble() ?? 0,
        totalCheckins: (j['totalCheckins'] as num?)?.toInt() ?? 0,
        yearDistance: (j['yearDistance'] as num?)?.toDouble() ?? 0,
        yearCheckins: (j['yearCheckins'] as num?)?.toInt() ?? 0,
        avgPaceSec: (j['avgPace'] as num?)?.toInt(),
      );
}
