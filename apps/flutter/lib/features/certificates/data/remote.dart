import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'models.dart';

/// 成就证书远程数据源：stats.myCertificates（里程碑 + 赛事 + 下一目标）。
class CertificatesRemote {
  CertificatesRemote._();

  static Future<CertificateBundle> fetch() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.statsBase,
      ApiEndpoints.actionMyCertificates,
    );
    return CertificateBundle.fromJson(data);
  }
}
