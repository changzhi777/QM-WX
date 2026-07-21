import 'package:dio/dio.dart';

import '../config/env.dart';
import '../storage/token_storage.dart';
import 'api_endpoints.dart';
import 'api_response.dart';

/// Dio 单例 + 统一拦截器。
///
/// - 请求拦截：注入 `Bearer <access>`（[ApiEndpoints.isPublic] 的路由除外）
/// - 响应拦截：解包 `{code:0,data}`；code 非 0 → reject [DioException]（error 字段嵌 [ApiException]）
/// - 401：用 refresh 换新 token 后重试一次原请求；仍失败 → 清 token（由守卫跳登录）
///
/// 调用方约定：用 [postJson] 拿解包后的 data 字段（Map），异常统一为 [ApiException]。
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  late final Dio dio = _build();

  /// 401 刷新锁（防并发请求重复刷新）
  bool _refreshing = false;

  Dio _build() {
    final d = Dio(
      BaseOptions(
        baseUrl: Env.apiBaseUrl,
        connectTimeout: const Duration(milliseconds: Env.connectTimeoutMs),
        receiveTimeout: const Duration(milliseconds: Env.receiveTimeoutMs),
        headers: const {'content-type': 'application/json'},
      ),
    );

    d.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          if (!ApiEndpoints.isPublic(options.path)) {
            final token = await TokenStorage.access;
            if (token != null && token.isNotEmpty) {
              options.headers['Authorization'] = 'Bearer $token';
            }
          }
          handler.next(options);
        },
        onResponse: (response, handler) {
          final body = response.data;
          if (body is Map<String, dynamic>) {
            final code = body['code'];
            if (code != 0) {
              // 业务失败：HTTP 200 但 code 非 0 → 转 DioException，error 嵌 ApiException
              final msg =
                  (body['msg'] ?? body['message'] ?? '请求失败').toString();
              final ex = ApiException(msg,
                  code: code is int ? code : null,
                  statusCode: response.statusCode);
              handler.reject(
                DioException(
                  requestOptions: response.requestOptions,
                  response: response,
                  type: DioExceptionType.badResponse,
                  error: ex,
                  message: msg,
                ),
                true,
              );
              return;
            }
          }
          handler.next(response);
        },
        onError: (e, handler) async {
          // 仅对「真 401」（token 失效）触发刷新；业务失败（HTTP 200 code 非 0）不走
          final is401 = e.response?.statusCode == 401;
          final path = e.requestOptions.path;
          if (is401 && !ApiEndpoints.isPublic(path) && !_refreshing) {
            _refreshing = true;
            try {
              final ok = await _doRefresh();
              if (ok) {
                final opts = e.requestOptions;
                final token = await TokenStorage.access;
                if (token != null) {
                  opts.headers['Authorization'] = 'Bearer $token';
                }
                final resp = await d.fetch(opts);
                _refreshing = false;
                return handler.resolve(resp);
              }
            } catch (_) {
              // 刷新异常 → 落到清 token
            }
            _refreshing = false;
            await TokenStorage.clear();
          }
          handler.next(e);
        },
      ),
    );

    return d;
  }

  /// 用 refresh 换新 token 对（一次性轮换）。成功返 true。
  Future<bool> _doRefresh() async {
    final refreshToken = await TokenStorage.refresh;
    if (refreshToken == null || refreshToken.isEmpty) return false;
    try {
      final resp = await dio.post(
        ApiEndpoints.authRefresh,
        data: {'refreshToken': refreshToken},
      );
      final body = resp.data as Map<String, dynamic>?;
      final data = body?['data'] as Map<String, dynamic>?;
      if (data != null && data['accessToken'] is String) {
        await TokenStorage.save(
          access: data['accessToken'] as String,
          refresh: data['refreshToken'] as String?,
        );
        return true;
      }
    } catch (_) {
      return false;
    }
    return false;
  }

  /// 便捷 POST：解包后返 data 字段。
  /// 业务失败（code 非 0）或网络失败 → 抛 [ApiException]。
  Future<Map<String, dynamic>> postJson(
    String path, {
    Map<String, dynamic>? data,
  }) async {
    try {
      final resp = await dio.post(path, data: data);
      final body = resp.data as Map<String, dynamic>;
      final d = body['data'];
      return d is Map<String, dynamic> ? d : const {};
    } on DioException catch (e) {
      // 业务失败（error 嵌 ApiException）直接抛
      final nested = e.error;
      if (nested is ApiException) throw nested;
      // 其余（超时/断网/HTTP 4xx5xx）统一包 ApiException
      throw ApiException(
        e.message ?? '网络错误，请稍后重试',
        statusCode: e.response?.statusCode,
      );
    }
  }

  /// action 模式便捷 POST：body 统一 `{ action, payload }`（后端 routes 约定）。
  /// 业务层统一用此方法，避免手写 action/payload 结构（DRY）。
  Future<Map<String, dynamic>> postAction(
    String path,
    String action, {
    Map<String, dynamic>? payload,
  }) {
    return postJson(path, data: {
      'action': action,
      'payload': payload ?? const {},
    });
  }
}

/// 全局懒加载 Dio（少量场景需直接用，如 SSE/下载）
final Dio http = ApiClient.instance.dio;
