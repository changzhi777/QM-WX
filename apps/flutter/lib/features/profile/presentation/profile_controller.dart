import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/profile_remote.dart';
import '../data/runner_stats.dart';

/// 跑者统计 FutureProvider（进页拉一次，下拉/失效刷新）。
final profileStatsProvider = FutureProvider<RunnerStats>((ref) async {
  return ProfileRemote.runnerStats();
});
