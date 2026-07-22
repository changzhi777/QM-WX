/// 力量训练历史 session（strength.listSessions 返回项）。
class StrengthSession {
  const StrengthSession({
    required this.id,
    required this.dateStr,
    required this.durationSec,
    required this.totalVolume,
    required this.setCount,
    this.notes,
  });

  final String id;
  final String dateStr;
  final int durationSec;
  final double totalVolume;
  final int setCount;
  final String? notes;

  factory StrengthSession.fromJson(Map<String, dynamic> j) => StrengthSession(
        id: (j['id'] as String?) ?? '',
        dateStr: (j['dateStr'] as String?) ?? '',
        durationSec: (j['durationSec'] as num?)?.toInt() ?? 0,
        totalVolume: (j['totalVolume'] as num?)?.toDouble() ?? 0,
        setCount: ((j['_count'] as Map?)?['sets'] as num?)?.toInt() ?? 0,
        notes: j['notes'] as String?,
      );

  /// 时长 mm:ss
  String get durationLabel {
    final m = durationSec ~/ 60;
    final s = durationSec % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }
}

/// 容量趋势汇总（strength.myVolume 返回）。
class VolumeSummary {
  const VolumeSummary({required this.totalSessions, required this.totalVolume, required this.days});
  final int totalSessions;
  final double totalVolume;
  final int days;

  factory VolumeSummary.fromJson(Map<String, dynamic> j) => VolumeSummary(
        totalSessions: (j['totalSessions'] as num?)?.toInt() ?? 0,
        totalVolume: (j['totalVolume'] as num?)?.toDouble() ?? 0,
        days: (j['days'] as num?)?.toInt() ?? 30,
      );
}
