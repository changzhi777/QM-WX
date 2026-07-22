import 'package:flutter/material.dart';

import '../features/ai_coach/presentation/ai_coach_page.dart';
import '../features/insight/presentation/insight_page.dart';
import '../features/profile/presentation/profile_page.dart';
import '../features/today/presentation/today_page.dart';

/// 4-tab 主壳：今日 / 健康助理 / 数据解读 / 我的。
///
/// Phase 2 批 5：「健康助理」tab 接入 AiCoachPage —— **4-tab 全实里程碑**。
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
          AiCoachPage(),
          InsightPage(),
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
