import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/ai_coach_models.dart';
import 'ai_coach_controller.dart';

/// 健康助理 AI 对话：消息气泡 + 输入栏 + 思考中态 + 新对话。
///
/// 批 5 MVP 非流式 chat（流式 SSE 留后续）。4-tab 最后占位消灭。
class AiCoachPage extends ConsumerStatefulWidget {
  const AiCoachPage({super.key});

  @override
  ConsumerState<AiCoachPage> createState() => _AiCoachPageState();
}

class _AiCoachPageState extends ConsumerState<AiCoachPage> {
  final _input = TextEditingController();
  final _scroll = ScrollController();

  @override
  void dispose() {
    _input.dispose();
    _scroll.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.jumpTo(_scroll.position.maxScrollExtent);
      }
    });
  }

  Future<void> _send() async {
    final text = _input.text;
    if (text.trim().isEmpty) return;
    _input.clear();
    await ref.read(aiCoachProvider.notifier).sendStream(text);
    _scrollToBottom();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(aiCoachProvider);
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final hasMessages = state.messages.isNotEmpty || state.sending;

    return Scaffold(
      appBar: AppBar(
        title: const Text('健康助理'),
        actions: [
          IconButton(
            tooltip: '新对话',
            icon: const Icon(Icons.add_comment_outlined),
            onPressed: state.sending
                ? null
                : () => ref.read(aiCoachProvider.notifier).newConversation(),
          ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: !hasMessages
                ? _empty(c, tt)
                : ListView.builder(
                    controller: _scroll,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: state.messages.length + (state.sending ? 1 : 0),
                    itemBuilder: (_, i) {
                      if (i < state.messages.length) {
                        return _bubble(state.messages[i], c);
                      }
                      return _thinking(c); // sending 思考中
                    },
                  ),
          ),
          if (state.error != null)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 4),
              child: Text(state.error!,
                  style: TextStyle(color: c.error, fontSize: 12)),
            ),
          _inputBar(state.sending, c),
        ],
      ),
    );
  }

  Widget _empty(ColorScheme c, TextTheme tt) => Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.smart_toy_outlined, size: 64, color: c.primary),
              const SizedBox(height: 12),
              Text('问问 AI 私教',
                  style: tt.titleMedium
                      ?.copyWith(color: c.primary, fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              Text('训练建议 · 配速分析 · 营养指导 · 伤病预防',
                  style: tt.bodySmall?.copyWith(color: c.outline),
                  textAlign: TextAlign.center),
            ],
          ),
        ),
      );

  Widget _bubble(ChatMessage m, ColorScheme c) {
    final isUser = m.isUser;
    return Align(
      alignment: isUser ? Alignment.centerRight : Alignment.centerLeft,
      child: Container(
        margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 12),
        padding: const EdgeInsets.all(12),
        constraints:
            BoxConstraints(maxWidth: MediaQuery.of(context).size.width * 0.75),
        decoration: BoxDecoration(
          color: isUser ? c.primary : c.surfaceContainerHighest,
          borderRadius: BorderRadius.only(
            topLeft: const Radius.circular(16),
            topRight: const Radius.circular(16),
            bottomLeft: Radius.circular(isUser ? 16 : 4),
            bottomRight: Radius.circular(isUser ? 4 : 16),
          ),
        ),
        child: Text(
          m.content,
          style: TextStyle(color: isUser ? c.onPrimary : c.onSurface),
        ),
      ),
    );
  }

  Widget _thinking(ColorScheme c) => Align(
        alignment: Alignment.centerLeft,
        child: Container(
          margin: const EdgeInsets.symmetric(vertical: 4, horizontal: 12),
          padding: const EdgeInsets.all(14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(
                  width: 16,
                  height: 16,
                  child: CircularProgressIndicator(strokeWidth: 2, color: c.primary)),
              const SizedBox(width: 8),
              Text('AI 思考中…', style: TextStyle(color: c.outline, fontSize: 13)),
            ],
          ),
        ),
      );

  Widget _inputBar(bool sending, ColorScheme c) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(8, 4, 8, 8),
          child: Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _input,
                  enabled: !sending,
                  minLines: 1,
                  maxLines: 4,
                  textInputAction: TextInputAction.send,
                  decoration: InputDecoration(
                    hintText: '输入你的问题…',
                    prefixIcon: const Icon(Icons.chat_bubble_outline),
                    border: OutlineInputBorder(
                        borderRadius: BorderRadius.circular(24)),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12),
                  ),
                  onSubmitted: sending ? null : (_) => _send(),
                ),
              ),
              const SizedBox(width: 8),
              IconButton.filled(
                onPressed: sending ? null : _send,
                icon: sending
                    ? SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: c.onPrimary))
                    : const Icon(Icons.send),
              ),
            ],
          ),
        ),
      );
}
