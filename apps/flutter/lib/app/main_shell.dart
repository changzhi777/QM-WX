import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/auth/presentation/auth_controller.dart';
import '../features/today/presentation/today_page.dart';

/// 4-tab 主壳：今日 / 健康助理 / 数据解读 / 我的。
///
/// 批 2：今日 tab 接入 TodayPage；其余 tab 仍占位（批 4 填 AI/图表）。
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
              title: '健康助理', emoji: '🤖', hint: 'AI 流式聊天（批 4）'),
          _Placeholder(
              title: '数据解读', emoji: '📊', hint: '图表趋势 + 截图解读（批 4）'),
          _MineTab(),
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

/// 「我的」tab（批 1 最小可用）：用户卡 + 登出。
class _MineTab extends ConsumerWidget {
  const _MineTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final user = ref.watch(authProvider).value?.user;

    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            CircleAvatar(
              radius: 40,
              backgroundColor: c.primaryContainer,
              backgroundImage: (user?.avatarUrl ?? '').isNotEmpty
                  ? NetworkImage(user!.avatarUrl!)
                  : null,
              child: (user?.avatarUrl ?? '').isEmpty
                  ? Icon(Icons.person, size: 44, color: c.onPrimaryContainer)
                  : null,
            ),
            const SizedBox(height: 12),
            Text(user?.displayName ?? '沐禾用户',
                style: tt.titleLarge?.copyWith(fontWeight: FontWeight.bold)),
            const SizedBox(height: 4),
            Text('${user?.growthLevel ?? 'free'} · ${user?.memberLevel ?? 'free'}',
                style: tt.bodySmall?.copyWith(color: c.outline)),
            const SizedBox(height: 8),
            Text('${user?.points ?? 0} 积分',
                style: tt.bodyMedium?.copyWith(color: c.primary)),
            const SizedBox(height: 24),
            OutlinedButton.icon(
              onPressed: () async {
                await ref.read(authProvider.notifier).logout();
              },
              icon: const Icon(Icons.logout),
              label: const Text('退出登录'),
            ),
          ],
        ),
      ),
    );
  }
}
