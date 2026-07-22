import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'runner_stats.dart';

/// 我的页远程数据源：runnerStats（跑者统计汇总）。
class ProfileRemote {
  ProfileRemote._();

  static Future<RunnerStats> runnerStats() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.statsBase,
      ApiEndpoints.actionMyRunnerStats,
    );
    return RunnerStats.fromJson(data);
  }
}
