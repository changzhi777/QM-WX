import 'package:flutter/material.dart';

import '../features/profile/presentation/profile_page.dart';
import '../features/today/presentation/today_page.dart';

/// 4-tab 主壳：今日 / 健康助理 / 数据解读 / 我的。
///
/// Phase 2 批 1：「我的」tab 接入 ProfilePage（替占位 _MineTab）。
/// 健康助理 / 数据解读 仍占位（后续批填 AI 流式 / 图表）。
class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  static const _tabs = <({IconData icon, String label})>[
    (icon: Icons.today_outlined, label: '今日'),
    (icon: Icons.smart_toy_outlined, label: '健康助理'),
    (icon: Icons.insights_outlined, label: '数据解读'),
    (icon: Icons.person_outline, label: '我的'),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [
          TodayPage(),
          _Placeholder(
              title: '健康助理', emoji: '🤖', hint: 'AI 流式聊天（后续批）'),
          _Placeholder(
              title: '数据解读', emoji: '📊', hint: '图表趋势 + 截图解读（后续批）'),
          ProfilePage(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: [
          for (final t in _tabs)
            NavigationDestination(icon: Icon(t.icon), label: t.label),
        ],
      ),
    );
  }
}

class _Placeholder extends StatelessWidget {
  const _Placeholder({required this.title, required this.emoji, required this.hint});
  final String title;
  final String emoji;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 72)),
            const SizedBox(height: 12),
            Text(title,
                style: tt.headlineMedium
                    ?.copyWith(color: c.primary, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text(hint,
                style: tt.bodyMedium?.copyWith(color: c.outline),
                textAlign: TextAlign.center),
          ],
        ),
      ),
    );
  }
}
