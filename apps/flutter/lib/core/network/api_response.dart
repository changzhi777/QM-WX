/// 统一 API 响应包装与异常。
///
/// 后端约定：成功 `{ code: 0, data }`，失败 `{ code: 4xx/5xx, msg }`。
/// 解包逻辑在 [ApiClient] 拦截器统一处理，业务层只拿 data。
class ApiResponse<T> {
  const ApiResponse({required this.code, this.data, this.msg});
  final int code;
  final T? data;
  final String? msg;

  bool get ok => code == 0;
}

/// API 异常：业务 code 非 0、或网络/解析失败、或 401 刷新后仍失败。
class ApiException implements Exception {
  const ApiException(this.message, {this.code, this.statusCode});
  final String message;
  final int? code; // 业务 code（后端 body.code）
  final int? statusCode; // HTTP status

  @override
  String toString() {
    final c = code != null ? '/$code' : '';
    final s = statusCode != null ? '$statusCode$c' : c.replaceFirst('/', '');
    return s.isEmpty ? 'ApiException: $message' : 'ApiException($s): $message';
  }
}
