import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import '../../checkin/data/checkin_models.dart';
import '../../checkin/data/checkin_remote.dart';
import '../../today/presentation/today_controller.dart';
import '../domain/track_state.dart';

/// GPS 轨迹录制控制器（Riverpod Notifier 状态机）。
///
/// - [start]：校验定位服务/权限 → 订阅位置流 + 启 1s 计时 → recording
/// - 位置流回调：累积点 + Geolocator.distanceBetween 累加距离
/// - [stop]：取消订阅/计时 → finished
/// - [submit]：复用 sport.checkin 提交 + 失效今日页 + 重置
/// - [reset]：清空 → idle
///
/// 不后台录制：Notifier 无 listener（page pop）时 onDispose 自动 stop。
class TrackController extends Notifier<TrackState> {
  StreamSubscription<Position>? _sub;
  Timer? _timer;

  @override
  TrackState build() {
    ref.onDispose(_cleanup);
    return TrackState.idle;
  }

  Future<void> start() async {
    // 权限/服务校验（失败抛中文异常，page 层展示）
    final enabled = await Geolocator.isLocationServiceEnabled();
    if (!enabled) throw Exception('定位服务未开启，请在系统设置中开启 GPS');
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied ||
        perm == LocationPermission.deniedForever) {
      throw Exception('定位权限被拒绝');
    }

    // 重置 + 起流
    state = TrackState.idle.copyWith(status: TrackStatus.recording);
    _sub = Geolocator.getPositionStream(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        distanceFilter: 5, // 每 5m 一个点，降噪
      ),
    ).listen(_onPosition);
    _timer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (state.status == TrackStatus.recording) {
        state = state.copyWith(durationSec: state.durationSec + 1);
      }
    });
  }

  void _onPosition(Position pos) {
    final pts = [
      ...state.points,
      TrackPoint(lat: pos.latitude, lon: pos.longitude),
    ];
    double addMeters = 0;
    if (state.points.isNotEmpty) {
      final last = state.points.last;
      addMeters = Geolocator.distanceBetween(
          last.lat, last.lon, pos.latitude, pos.longitude);
    }
    state = state.copyWith(
      points: pts,
      distanceKm: state.distanceKm + addMeters / 1000,
    );
  }

  void stop() {
    _cleanup();
    state = state.copyWith(status: TrackStatus.finished);
  }

  /// 提交打卡：校验距离 → 复用 sport.checkin → 失效今日页 → 重置。
  /// 距离不足/网络失败抛异常（page 层展示，不 pop）。
  Future<void> submit() async {
    if (state.distanceKm < 0.5) {
      throw Exception('距离不足 0.5km，无法打卡');
    }
    final start = state.points.isNotEmpty ? state.points.first : null;
    await CheckinRemote.submit(CheckinRequest(
      distance: state.distanceKm,
      durationSec: state.durationSec,
      sportType: 'run',
      lat: start?.lat,
      lon: start?.lon,
    ));
    ref.invalidate(todayProvider);
    reset();
  }

  void reset() {
    _cleanup();
    state = TrackState.idle;
  }

  void _cleanup() {
    _sub?.cancel();
    _sub = null;
    _timer?.cancel();
    _timer = null;
  }
}

final trackProvider =
    NotifierProvider<TrackController, TrackState>(TrackController.new);
