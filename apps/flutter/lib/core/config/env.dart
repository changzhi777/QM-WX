/// 环境配置（API base + timeout）
///
/// Phase 1 批 1：dev 连本机后端，prod 连生产域名。
/// flavor（dev/staging/prod）拆分留 Phase 2，当前用 dart.vm.product 区分。
class Env {
  Env._();

  /// 是否 release 构建
  static const bool isProd = bool.fromEnvironment('dart.vm.product');

  /// API base URL
  /// - dev：10.0.2.2 是安卓模拟器映射宿主机 localhost（真机改局域网 IP，如 http://192.168.x.x:3000）
  /// - prod：生产域名
  static const String apiBaseUrl =
      isProd ? 'https://qingmulife.cn' : 'http://10.0.2.2:3000';

  /// 通用超时（ms）
  static const int connectTimeoutMs = 10000;
  static const int receiveTimeoutMs = 15000;
}
