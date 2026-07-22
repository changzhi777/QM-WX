import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/insight_models.dart';
import '../data/insight_remote.dart';

/// 数据解读聚合数据（annualReport + userProfile 并行降级）。
class InsightData {
  const InsightData({this.annual, this.profile});
  final AnnualReport? annual;
  final UserProfile? profile;
}

/// 数据解读控制器：2 API 并行，单个失败不阻塞其他。
class InsightController extends AsyncNotifier<InsightData> {
  @override
  Future<InsightData> build() => _load();

  Future<InsightData> _load() async {
    AnnualReport? annual;
    UserProfile? profile;
    Future<void> loadAnnual() async {
      try {
        annual = await InsightRemote.annualReport();
      } catch (_) {}
    }
    Future<void> loadProfile() async {
      try {
        profile = await InsightRemote.userProfile();
      } catch (_) {}
    }
    await Future.wait<void>([loadAnnual(), loadProfile()]);
    return InsightData(annual: annual, profile: profile);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(_load);
  }
}

final insightProvider =
    AsyncNotifierProvider<InsightController, InsightData>(InsightController.new);
