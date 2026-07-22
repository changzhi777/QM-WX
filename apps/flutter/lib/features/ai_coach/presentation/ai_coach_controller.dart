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

  /// 清空当前会话（新对话）
  void newConversation() {
    state = const ChatState();
  }
}

final aiCoachProvider = StateNotifierProvider<AiCoachController, ChatState>(
    (ref) => AiCoachController());
