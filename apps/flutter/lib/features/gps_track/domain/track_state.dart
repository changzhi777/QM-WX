// GPS 轨迹状态模型。

/// 录制状态机：空闲 → 录制中 → 已结束（→ 提交 / 重录）
enum TrackStatus { idle, recording, finished }

/// 轨迹点（lat/lon）。
class TrackPoint {
  const TrackPoint({required this.lat, required this.lon});
  final double lat;
  final double lon;
}

class TrackState {
  const TrackState({
    this.status = TrackStatus.idle,
    this.points = const [],
    this.distanceKm = 0,
    this.durationSec = 0,
  });

  final TrackStatus status;
  final List<TrackPoint> points;
  final double distanceKm;
  final int durationSec;

  static const idle = TrackState();

  /// 配速（秒/公里）；距离 0 时返 0。
  int get paceSecPerKm =>
      distanceKm > 0 ? (durationSec / distanceKm).round() : 0;

  TrackState copyWith({
    TrackStatus? status,
    List<TrackPoint>? points,
    double? distanceKm,
    int? durationSec,
  }) =>
      TrackState(
        status: status ?? this.status,
        points: points ?? this.points,
        distanceKm: distanceKm ?? this.distanceKm,
        durationSec: durationSec ?? this.durationSec,
      );
}
