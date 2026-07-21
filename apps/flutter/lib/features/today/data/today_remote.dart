import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'today_models.dart';

/// 今日页远程数据源：healthScore / dailyReport / weather。
///
/// weather 批 2 不传 coord（默认长沙）；批 3+ 接 GPS 定位后传 {lat, lon}。
/// 统一走 postAction（body `{action, payload}` 嵌套，后端 routes 约定）。
class TodayRemote {
  TodayRemote._();

  static Future<HealthScore> healthScore() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.statsBase,
      ApiEndpoints.actionHealthScore,
    );
    return HealthScore.fromJson(data);
  }

  static Future<DailyReport> dailyReport() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.statsBase,
      ApiEndpoints.actionDailyReport,
    );
    return DailyReport.fromJson(data);
  }

  static Future<Weather> weather({double? lat, double? lon}) async {
    final payload = <String, dynamic>{};
    if (lat != null && lon != null) {
      payload['lat'] = lat;
      payload['lon'] = lon;
    }
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.statsBase,
      ApiEndpoints.actionWeather,
      payload: payload,
    );
    return Weather.fromJson(data);
  }
}
