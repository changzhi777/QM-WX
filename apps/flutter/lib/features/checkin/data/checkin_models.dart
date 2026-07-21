// 运动打卡模型（与后端 sport.checkin CheckinInputSchema 对齐）。
// schema 是 .strict()，toJson 只含 schema 内字段（多传会被拒）。

class CheckinRequest {
  const CheckinRequest({
    required this.distance,
    this.durationSec,
    this.sportType = 'run',
    this.shoeId,
    this.lat,
    this.lon,
  });

  final double distance; // km（0.5-50）
  final int? durationSec;
  final String sportType; // run/ride/swim/walk，默认 run
  final String? shoeId;
  final double? lat;
  final double? lon;

  /// 序列化为后端 payload（strict schema 内字段）。
  /// dataSource 固定 manual（手动打卡）；points 不传（服务端产生，防作弊）。
  Map<String, dynamic> toJson() {
    final m = <String, dynamic>{
      'distance': distance,
      'sportType': sportType,
      'dataSource': 'manual',
    };
    final d = durationSec;
    if (d != null && d > 0) m['durationSec'] = d;
    final s = shoeId;
    if (s != null && s.isNotEmpty) m['shoeId'] = s;
    final la = lat;
    final lo = lon;
    if (la != null && lo != null) {
      m['lat'] = la;
      m['lon'] = lo;
    }
    return m;
  }
}

class CheckinResult {
  const CheckinResult({required this.points});
  final int points;

  factory CheckinResult.fromJson(Map<String, dynamic> j) =>
      CheckinResult(points: (j['points'] as num?)?.toInt() ?? 0);
}
