import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../domain/track_math.dart';
import '../domain/track_state.dart';
import 'track_controller.dart';

/// GPS 跑步页：录制轨迹 + 实时数据 + CustomPaint 轨迹图 + 结束提交打卡。
///
/// 地图：高德 key 未到位，用 CustomPaint 归一化轨迹缩略图（key 到位后替换为 amap）。
class TrackPage extends ConsumerWidget {
  const TrackPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final s = ref.watch(trackProvider);
    final c = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('GPS 跑步')),
      body: Column(
        children: [
          Expanded(flex: 3, child: _TrackMap(points: s.points, color: c.primary)),
          _DataPanel(state: s),
          Padding(
            padding: const EdgeInsets.all(16),
            child: _Actions(state: s),
          ),
        ],
      ),
    );
  }
}

/// 按钮区（按状态切换）。提交/开始异常在 page 层展示 SnackBar。
class _Actions extends ConsumerWidget {
  const _Actions({required this.state});
  final TrackState state;

  Future<void> _onSubmit(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(trackProvider.notifier).submit();
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('打卡成功！')));
      context.pop();
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', ''))));
    }
  }

  Future<void> _onStart(BuildContext context, WidgetRef ref) async {
    try {
      await ref.read(trackProvider.notifier).start();
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(e.toString().replaceFirst('Exception: ', ''))));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = Theme.of(context).colorScheme;
    switch (state.status) {
      case TrackStatus.idle:
        return FilledButton.icon(
          onPressed: () => _onStart(context, ref),
          icon: const Icon(Icons.play_arrow, size: 28),
          label: const Text('开始跑步', style: TextStyle(fontSize: 18)),
          style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(56)),
        );
      case TrackStatus.recording:
        return FilledButton.icon(
          onPressed: () => ref.read(trackProvider.notifier).stop(),
          icon: const Icon(Icons.stop, size: 28),
          label: const Text('结束', style: TextStyle(fontSize: 18)),
          style: FilledButton.styleFrom(
              backgroundColor: c.error, minimumSize: const Size.fromHeight(56)),
        );
      case TrackStatus.finished:
        return Row(
          children: [
            Expanded(
              child: OutlinedButton.icon(
                onPressed: () => ref.read(trackProvider.notifier).reset(),
                icon: const Icon(Icons.refresh),
                label: const Text('重录'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: FilledButton.icon(
                onPressed:
                    state.distanceKm >= 0.5 ? () => _onSubmit(context, ref) : null,
                icon: const Icon(Icons.check),
                label: const Text('提交打卡'),
              ),
            ),
          ],
        );
    }
  }
}

/// 实时数据栏：距离 / 时长 / 配速。
class _DataPanel extends StatelessWidget {
  const _DataPanel({required this.state});
  final TrackState state;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
      color: c.surfaceContainerLow,
      child: Row(
        children: [
          Expanded(child: _Stat(value: formatDistance(state.distanceKm), label: '公里')),
          Expanded(child: _Stat(value: formatDuration(state.durationSec), label: '时长')),
          Expanded(child: _Stat(value: formatPace(state.paceSecPerKm), label: '配速')),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(value,
            style: tt.headlineMedium
                ?.copyWith(fontWeight: FontWeight.bold, color: c.primary)),
        const SizedBox(height: 4),
        Text(label, style: tt.bodySmall?.copyWith(color: c.outline)),
      ],
    );
  }
}

/// 轨迹图：CustomPaint 归一化 lat/lon 画线（高德 key 到位后替换为 amap）。
class _TrackMap extends StatelessWidget {
  const _TrackMap({required this.points, required this.color});
  final List<TrackPoint> points;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    return Container(
      color: c.surfaceContainerLowest,
      alignment: Alignment.center,
      padding: const EdgeInsets.all(24),
      child: points.length < 2
          ? Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.map_outlined, size: 64, color: c.outline),
                const SizedBox(height: 8),
                Text(
                  points.isEmpty ? '点击「开始跑步」录制轨迹' : '轨迹录制中…',
                  style: TextStyle(color: c.outline),
                ),
                const SizedBox(height: 4),
                Text('（真实地图待高德 key 配置）',
                    style: TextStyle(color: c.outline, fontSize: 11)),
              ],
            )
          : CustomPaint(
              painter: _TrackPainter(points, color), size: Size.infinite),
    );
  }
}

class _TrackPainter extends CustomPainter {
  _TrackPainter(this.points, this.color);
  final List<TrackPoint> points;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (points.length < 2) return;
    double minLat = points.first.lat, maxLat = minLat;
    double minLon = points.first.lon, maxLon = minLon;
    for (final p in points) {
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
      if (p.lon < minLon) minLon = p.lon;
      if (p.lon > maxLon) maxLon = p.lon;
    }
    final dLat = (maxLat - minLat).abs();
    final dLon = (maxLon - minLon).abs();
    const pad = 16.0;
    final w = size.width - pad * 2;
    final h = size.height - pad * 2;

    Offset toOffset(TrackPoint p) {
      final x = pad + (dLon > 0 ? ((p.lon - minLon) / dLon) * w : w / 2);
      // lat 越大越靠上（y 反转）
      final y = pad + (dLat > 0 ? (1 - (p.lat - minLat) / dLat) * h : h / 2);
      return Offset(x, y);
    }

    final paint = Paint()
      ..color = color
      ..style = PaintingStyle.stroke
      ..strokeWidth = 4
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;
    final start = toOffset(points.first);
    final path = Path()..moveTo(start.dx, start.dy);
    for (var i = 1; i < points.length; i++) {
      final o = toOffset(points[i]);
      path.lineTo(o.dx, o.dy);
    }
    canvas.drawPath(path, paint);
    // 起点绿、终点红
    canvas.drawCircle(start, 6, Paint()..color = Colors.green);
    canvas.drawCircle(toOffset(points.last), 6, Paint()..color = Colors.red);
  }

  @override
  bool shouldRepaint(_TrackPainter old) =>
      old.points.length != points.length ||
      old.points.last != points.last;
}
