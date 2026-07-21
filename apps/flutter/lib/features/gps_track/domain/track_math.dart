// GPS 轨迹数据格式化工具。

/// 时长格式化：秒 → "m:ss" 或 "h:mm:ss"
String formatDuration(int sec) {
  if (sec < 0) sec = 0;
  final h = sec ~/ 3600;
  final m = (sec % 3600) ~/ 60;
  final s = sec % 60;
  final mm = m.toString().padLeft(2, '0');
  final ss = s.toString().padLeft(2, '0');
  return h > 0 ? '$h:$mm:$ss' : '$m:$ss';
}

/// 配速格式化：秒/公里 → "m'ss\""
String formatPace(int secPerKm) {
  if (secPerKm <= 0) return "--'--\"";
  final m = secPerKm ~/ 60;
  final s = secPerKm % 60;
  return "$m'${s.toString().padLeft(2, '0')}\"";
}

/// 距离格式化：km → "5.02"（2 位小数）
String formatDistance(double km) => km.toStringAsFixed(2);
