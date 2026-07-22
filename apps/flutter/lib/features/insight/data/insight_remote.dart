import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'insight_models.dart';

/// 数据解读远程数据源：myAnnualReport + userProfile。
class InsightRemote {
  InsightRemote._();

  static Future<AnnualReport> annualReport() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.statsBase,
      ApiEndpoints.actionMyAnnualReport,
    );
    return AnnualReport.fromJson(data);
  }

  static Future<UserProfile> userProfile() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.statsBase,
      ApiEndpoints.actionUserProfile,
    );
    return UserProfile.fromJson(data);
  }
}
