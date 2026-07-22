import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';

import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import '../../../core/storage/token_storage.dart';
import 'ai_coach_models.dart';

/// 健康助理远程数据源：chat（非流式）+ chatStream（SSE 流式）。
class AiCoachRemote {
  AiCoachRemote._();

  /// 非流式对话：message + conversationId(可选) → {reply, conversationId}
  static Future<ChatResponse> chat(String message, String? conversationId) async {
    final payload = <String, dynamic>{'message': message};
    final cid = conversationId;
    if (cid != null && cid.isNotEmpty) payload['conversationId'] = cid;
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.aiCoachBase,
      ApiEndpoints.actionAiChat,
      payload: payload,
    );
    return ChatResponse.fromJson(data);
  }

  /// 流式对话（chatStream SSE）：逐 token 推送。
  ///
  /// 后端 `data: asciiFrame({t:"token"})\n\n` + 完成帧 `{done:true,conversationId}` + 错误帧 `{error}`。
  /// asciiFrame = JSON + 中文 \uXXXX 转义（jsonDecode 自动解码）。
  static Future<void> chatStream(
    String message,
    String? conversationId, {
    required void Function(String token) onToken,
    required void Function(String conversationId) onDone,
    required void Function(String error) onError,
  }) async {
    final token = await TokenStorage.access;
    final payload = <String, dynamic>{'message': message};
    if (conversationId != null && conversationId.isNotEmpty) {
      payload['conversationId'] = conversationId;
    }
    try {
      final response = await ApiClient.instance.dio.post(
        ApiEndpoints.aiCoachBase,
        data: {'action': 'chatStream', 'payload': payload},
        options: Options(
          responseType: ResponseType.stream,
          headers: token != null && token.isNotEmpty
              ? {'Authorization': 'Bearer $token'}
              : null,
        ),
      );
      final stream = (response.data as ResponseBody).stream;
      String buffer = '';
      await for (final chunk in stream.cast<List<int>>().transform(utf8.decoder)) {
        buffer += chunk;
        // SSE 帧以 \n\n 分隔
        int idx;
        while ((idx = buffer.indexOf('\n\n')) >= 0) {
          final frame = buffer.substring(0, idx);
          buffer = buffer.substring(idx + 2);
          _handleSseFrame(frame, onToken, onDone, onError);
        }
      }
      // 残余帧
      if (buffer.trim().isNotEmpty) {
        _handleSseFrame(buffer, onToken, onDone, onError);
      }
    } on DioException catch (e) {
      onError(e.message ?? e.toString());
    } catch (e) {
      onError(e.toString());
    }
  }

  /// 解析单 SSE 帧（可能多 data: 行）
  static void _handleSseFrame(
    String frame,
    void Function(String) onToken,
    void Function(String) onDone,
    void Function(String) onError,
  ) {
    for (final line in frame.split('\n')) {
      final trimmed = line.trim();
      if (!trimmed.startsWith('data: ')) continue;
      try {
        final obj = jsonDecode(trimmed.substring(6)) as Map<String, dynamic>;
        final t = obj['t'];
        if (t is String) {
          onToken(t);
        } else if (obj['done'] == true) {
          onDone((obj['conversationId'] as String?) ?? '');
        } else if (obj['error'] is String) {
          onError(obj['error'] as String);
        }
      } catch (_) {
        // 单帧解析失败跳过（容错）
      }
    }
  }
}
