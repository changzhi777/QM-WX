// AI 对话模型（与后端 ai-coach.chat 对齐）。

class ChatMessage {
  const ChatMessage({required this.role, required this.content});
  final String role; // 'user' / 'assistant'
  final String content;

  bool get isUser => role == 'user';
}

class ChatResponse {
  const ChatResponse({required this.reply, required this.conversationId});
  final String reply;
  final String conversationId;

  factory ChatResponse.fromJson(Map<String, dynamic> j) => ChatResponse(
        reply: (j['reply'] as String?) ?? '',
        conversationId: (j['conversationId'] as String?) ?? '',
      );
}
