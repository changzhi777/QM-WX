import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/today_models.dart';
import '../data/today_remote.dart';

/// 今日页聚合数据（3 接口降级：任一失败不阻塞其他）。
class TodayData {
  const TodayData({this.score, this.report, this.weather});
  final HealthScore? score;
  final DailyReport? report;
  final Weather? weather;
}

/// 今日页控制器：并行拉 healthScore / dailyReport / weather，单个失败优雅降级。
class TodayController extends AsyncNotifier<TodayData> {
  @override
  Future<TodayData> build() => _load();

  Future<TodayData> _load() async {
    HealthScore? score;
    DailyReport? report;
    Weather? weather;

    // 局部 async + try/catch（避 then/catchError 的返回类型约束）；
    // 闭包捕获外层变量赋值，3 个并行，任一失败不阻塞其他。
    Future<void> loadScore() async {
      try {
        score = await TodayRemote.healthScore();
      } catch (_) {}
    }

    Future<void> loadReport() async {
      try {
        report = await TodayRemote.dailyReport();
      } catch (_) {}
    }

    Future<void> loadWeather() async {
      try {
        weather = await TodayRemote.weather();
      } catch (_) {}
    }

    await Future.wait<void>([loadScore(), loadReport(), loadWeather()]);
    return TodayData(score: score, report: report, weather: weather);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(_load);
  }
}

final todayProvider =
    AsyncNotifierProvider<TodayController, TodayData>(TodayController.new);
