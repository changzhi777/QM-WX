import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'checkin_models.dart';

/// 打卡远程数据源：POST /api/sport action:checkin → { points }
class CheckinRemote {
  CheckinRemote._();

  static Future<CheckinResult> submit(CheckinRequest req) async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.sportBase,
      ApiEndpoints.actionCheckin,
      payload: req.toJson(),
    );
    return CheckinResult.fromJson(data);
  }
}
