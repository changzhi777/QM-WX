import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'models.dart';

/// 每日报告远程数据源：dailyReportList（历史，分页）。
class DailyReportRemote {
  DailyReportRemote._();

  static Future<List<DailyReport>> list({int page = 1, int pageSize = 20}) async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.statsBase,
      ApiEndpoints.actionDailyReportList,
      payload: {'page': page, 'pageSize': pageSize},
    );
    final list = (data['list'] as List?) ?? const [];
    return list
        .map((e) => DailyReport.fromJson(e as Map<String, dynamic>))
        .toList();
  }
}
