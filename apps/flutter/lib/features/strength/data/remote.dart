import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'models.dart';

/// 力量训练远程数据源：listSessions（历史）+ myVolume（容量趋势）。
class StrengthRemote {
  StrengthRemote._();

  static Future<List<StrengthSession>> listSessions() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.strengthBase,
      ApiEndpoints.actionStrengthListSessions,
    );
    final list = (data['list'] as List?) ?? const [];
    return list
        .map((e) => StrengthSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<VolumeSummary> myVolume() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.strengthBase,
      ApiEndpoints.actionStrengthMyVolume,
    );
    return VolumeSummary.fromJson(data);
  }
}
