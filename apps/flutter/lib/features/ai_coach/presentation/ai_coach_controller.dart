import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/ai_coach_models.dart';
import '../data/ai_coach_remote.dart';

/// 对话状态：累积消息 + conversationId（多轮）+ sending。
class ChatState {
  const ChatState({
    this.messages = const [],
    this.conversationId,
    this.sending = false,
    this.error,
  });

  final List<ChatMessage> messages;
  final String? conversationId;
  final bool sending;
  final String? error;

  ChatState copyWith({
    List<ChatMessage>? messages,
    String? conversationId,
    bool? sending,
    String? error,
    bool clearError = false,
  }) =>
      ChatState(
        messages: messages ?? this.messages,
        conversationId: conversationId ?? this.conversationId,
        sending: sending ?? this.sending,
        error: clearError ? null : (error ?? this.error),
      );
}

/// AI 对话控制器（StateNotifier 累积消息）。
class AiCoachController extends StateNotifier<ChatState> {
  AiCoachController() : super(const ChatState());

  Future<void> send(String text) async {
    final msg = text.trim();
    if (msg.isEmpty || state.sending) return;
    final userMsg = ChatMessage(role: 'user', content: msg);
    state = state.copyWith(
      messages: [...state.messages, userMsg],
      sending: true,
      clearError: true,
    );
    try {
      final resp = await AiCoachRemote.chat(msg, state.conversationId);
      state = state.copyWith(
        messages: [
          ...state.messages,
          ChatMessage(role: 'assistant', content: resp.reply),
        ],
        conversationId: resp.conversationId,
        sending: false,
      );
    } catch (e) {
      state = state.copyWith(sending: false, error: e.toString());
    }
  }

  /// 流式发送（chatStream SSE）：逐 token 追加 assistant 消息（打字机效果）
  Future<void> sendStream(String text) async {
    final msg = text.trim();
    if (msg.isEmpty || state.sending) return;
    final userMsg = ChatMessage(role: 'user', content: msg);
    // 预占空 assistant 消息（逐 token 填充）
    state = state.copyWith(
      messages: [...state.messages, userMsg, const ChatMessage(role: 'assistant', content: '')],
      sending: true,
      clearError: true,
    );
    await AiCoachRemote.chatStream(
      msg,
      state.conversationId,
      onToken: (t) {
        final msgs = List<ChatMessage>.from(state.messages);
        for (var i = msgs.length - 1; i >= 0; i--) {
          if (msgs[i].role == 'assistant') {
            msgs[i] = ChatMessage(role: 'assistant', content: msgs[i].content + t);
            break;
          }
        }
        state = state.copyWith(messages: msgs);
      },
      onDone: (cid) {
        state = state.copyWith(conversationId: cid, sending: false);
      },
      onError: (e) {
        // 错误：移除空 assistant 占位 + 设 error
        final msgs = state.messages
            .where((m) => !(m.role == 'assistant' && m.content.isEmpty))
            .toList();
        state = state.copyWith(messages: msgs, sending: false, error: e);
      },
    );
  }

  /// 清空当前会话（新对话）
  void newConversation() {
    state = const ChatState();
  }
}

final aiCoachProvider = StateNotifierProvider<AiCoachController, ChatState>(
    (ref) => AiCoachController());
