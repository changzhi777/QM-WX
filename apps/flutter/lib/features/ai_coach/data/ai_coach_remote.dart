import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'ai_coach_models.dart';

/// 健康助理远程数据源：chat（非流式）。
class AiCoachRemote {
  AiCoachRemote._();

  /// 对话：message + conversationId(可选，多轮) → {reply, conversationId}
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
}
