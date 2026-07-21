// 今日页数据模型（与后端 stats.healthScore / dailyReport / weather 对齐）。
// 后端返字段较多，这里取展示所需，其余忽略（向前兼容）。

class HealthTrend {
  const HealthTrend({this.yesterday = 0, this.diff = 0});
  final int yesterday;
  final int diff; // 今日 - 昨日（正=变好）

  factory HealthTrend.fromJson(Map<String, dynamic> j) => HealthTrend(
        yesterday: (j['yesterday'] as num?)?.toInt() ?? 0,
        diff: (j['diff'] as num?)?.toInt() ?? 0,
      );
}

class HealthScore {
  const HealthScore({
    required this.date,
    required this.score,
    this.steps = 0,
    this.restingHr,
    this.sleepHours,
    this.trend,
  });
  final String date;
  final int score; // 0-100
  final int steps;
  final int? restingHr;
  final double? sleepHours;
  final HealthTrend? trend;

  factory HealthScore.fromJson(Map<String, dynamic> j) => HealthScore(
        date: (j['date'] as String?) ?? '',
        score: (j['score'] as num?)?.toInt() ?? 0,
        steps: (j['steps'] as num?)?.toInt() ?? 0,
        restingHr: (j['restingHr'] as num?)?.toInt(),
        sleepHours: (j['sleepHours'] as num?)?.toDouble(),
        trend: j['trend'] is Map<String, dynamic>
            ? HealthTrend.fromJson(j['trend'] as Map<String, dynamic>)
            : null,
      );
}

class DailyReport {
  const DailyReport({
    this.id,
    required this.date,
    this.healthScore = 0,
    this.reportText = '',
    this.alertText,
    this.steps = 0,
    this.restingHr,
    this.sleepHours,
  });
  final String? id;
  final String date;
  final int healthScore;
  final String reportText;
  final String? alertText;
  final int steps;
  final int? restingHr;
  final double? sleepHours;

  factory DailyReport.fromJson(Map<String, dynamic> j) => DailyReport(
        id: j['id'] as String?,
        date: (j['date'] as String?) ?? '',
        healthScore: (j['healthScore'] as num?)?.toInt() ?? 0,
        reportText: (j['reportText'] as String?) ?? '',
        alertText: j['alertText'] as String?,
        steps: (j['steps'] as num?)?.toInt() ?? 0,
        restingHr: (j['restingHr'] as num?)?.toInt(),
        sleepHours: (j['sleepHours'] as num?)?.toDouble(),
      );
}

class Weather {
  const Weather({
    this.city = '',
    this.text = '',
    this.temperature = 0,
    this.feelsLike = 0,
    this.humidity = 0,
    this.icon = '',
    this.updatedAt,
  });
  final String city;
  final String text;
  final int temperature;
  final int feelsLike;
  final int humidity;
  final String icon; // emoji 或 code
  final String? updatedAt;

  factory Weather.fromJson(Map<String, dynamic> j) => Weather(
        city: (j['city'] as String?) ?? '',
        text: (j['text'] as String?) ?? '',
        temperature: (j['temperature'] as num?)?.toInt() ?? 0,
        feelsLike: (j['feelsLike'] as num?)?.toInt() ?? 0,
        humidity: (j['humidity'] as num?)?.toInt() ?? 0,
        icon: (j['icon'] as String?) ?? '',
        updatedAt: j['updatedAt'] as String?,
      );
}
