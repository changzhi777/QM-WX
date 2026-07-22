// 数据解读模型（与后端 stats.myAnnualReport / userProfile 对齐）。

class MonthlyDistance {
  const MonthlyDistance({required this.month, this.distance = 0, this.count = 0});
  final int month;
  final double distance;
  final int count;

  factory MonthlyDistance.fromJson(Map<String, dynamic> j) => MonthlyDistance(
        month: (j['month'] as num?)?.toInt() ?? 0,
        distance: (j['distance'] as num?)?.toDouble() ?? 0,
        count: (j['count'] as num?)?.toInt() ?? 0,
      );
}

class AnnualReport {
  const AnnualReport({
    this.year = 0,
    this.yearDistance = 0,
    this.yearCheckins = 0,
    this.avgPaceSec,
    this.activeDays = 0,
    this.monthly = const [],
  });

  final int year;
  final double yearDistance;
  final int yearCheckins;
  final int? avgPaceSec; // 秒/km
  final int activeDays;
  final List<MonthlyDistance> monthly;

  factory AnnualReport.fromJson(Map<String, dynamic> j) => AnnualReport(
        year: (j['year'] as num?)?.toInt() ?? 0,
        yearDistance: (j['yearDistance'] as num?)?.toDouble() ?? 0,
        yearCheckins: (j['yearCheckins'] as num?)?.toInt() ?? 0,
        avgPaceSec: (j['avgPace'] as num?)?.toInt(),
        activeDays: (j['activeDays'] as num?)?.toInt() ?? 0,
        monthly: ((j['monthly'] as List?) ?? const [])
            .map((e) => MonthlyDistance.fromJson(e as Map<String, dynamic>))
            .toList(),
      );
}

class UserProfile {
  const UserProfile({this.tags = const [], this.summary = ''});

  final List<String> tags; // [体型, 跑者级]
  final String summary;

  factory UserProfile.fromJson(Map<String, dynamic> j) => UserProfile(
        tags: ((j['tags'] as List?) ?? const [])
            .map((e) => e.toString())
            .toList(),
        summary: (j['summary'] as String?) ?? '',
      );
}
