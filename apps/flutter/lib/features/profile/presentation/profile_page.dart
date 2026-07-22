import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design_system/app_card.dart';
import '../../auth/presentation/auth_controller.dart';
import 'profile_controller.dart';

/// 我的页：用户卡 + 跑者数据条 + 入口宫格（占位）+ 退出登录。
///
/// 批 1 MVP：入口宫格点击占位（Phase 2 后续批接跑鞋/目标/动态/会员/设置详情）。
class ProfilePage extends ConsumerWidget {
  const ProfilePage({super.key});

  void _todo(BuildContext context, String name) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('$name（Phase 2 后续批上线）')),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).value?.user;
    final statsAsync = ref.watch(profileStatsProvider);
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    return Scaffold(
      appBar: AppBar(title: const Text('我的')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 用户卡
          AppCard(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 32,
                  backgroundColor: c.primaryContainer,
                  backgroundImage: (user?.avatarUrl ?? '').isNotEmpty
                      ? NetworkImage(user!.avatarUrl!)
                      : null,
                  child: (user?.avatarUrl ?? '').isEmpty
                      ? Icon(Icons.person, color: c.onPrimaryContainer)
                      : null,
                ),
                const SizedBox(width: 16),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(user?.displayName ?? '沐禾用户',
                          style: tt.titleLarge
                              ?.copyWith(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 6),
                      Wrap(
                        spacing: 6,
                        children: [
                          _chip(c.primaryContainer, c.onPrimaryContainer,
                              '等级 ${user?.growthLevel ?? 'free'}'),
                          _chip(c.tertiaryContainer, c.onTertiaryContainer,
                              _memberLabel(user?.memberLevel)),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text('${user?.points ?? 0} 积分',
                          style: tt.bodyMedium
                              ?.copyWith(color: c.primary, fontWeight: FontWeight.bold)),
                    ],
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          // 跑者数据条
          statsAsync.when(
            loading: () => const Center(
                child: Padding(
                    padding: EdgeInsets.all(24),
                    child: CircularProgressIndicator())),
            error: (_, _) => AppCard(
                child: Text('统计数据加载失败', style: TextStyle(color: c.error))),
            data: (s) => Row(
              children: [
                Expanded(
                    child: _Stat(
                        value: s.totalDistance.toStringAsFixed(1),
                        label: '累计 km')),
                const SizedBox(width: 12),
                Expanded(
                    child: _Stat(
                        value: '${s.totalCheckins}', label: '打卡次')),
                const SizedBox(width: 12),
                Expanded(
                    child: _Stat(
                        value: s.yearDistance.toStringAsFixed(1),
                        label: '今年 km')),
              ],
            ),
          ),
          const SizedBox(height: 16),
          // 入口宫格
          AppCard(
            padding: const EdgeInsets.all(12),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Padding(
                  padding: const EdgeInsets.only(left: 4, bottom: 8),
                  child: Text('更多功能',
                      style: tt.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
                ),
                GridView.count(
                  crossAxisCount: 4,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 0.85,
                  children: [
                    _Entry(Icons.directions_run, '跑鞋', () => context.push('/shoes')),
                    _Entry(Icons.flag_outlined, '目标', () => context.push('/goals')),
                    _Entry(Icons.dynamic_feed, '动态', () => _todo(context, '动态')),
                    _Entry(Icons.card_membership, '会员', () => _todo(context, '会员')),
                    _Entry(Icons.insights_outlined, '数据', () => _todo(context, '数据解读')),
                    _Entry(Icons.notifications_none, '消息', () => _todo(context, '消息')),
                    _Entry(Icons.settings_outlined, '设置', () => _todo(context, '设置')),
                    _Entry(Icons.info_outline, '关于', () => _todo(context, '关于')),
                  ],
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          OutlinedButton.icon(
            onPressed: () async {
              await ref.read(authProvider.notifier).logout();
            },
            icon: const Icon(Icons.logout),
            label: const Text('退出登录'),
          ),
        ],
      ),
    );
  }

  Widget _chip(Color bg, Color fg, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration:
            BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
        child: Text(text, style: TextStyle(fontSize: 11, color: fg)),
      );

  String _memberLabel(String? level) {
    switch (level) {
      case 'monthly':
        return '月度会员';
      case 'quarterly':
        return '季度会员';
      case 'yearly':
        return '年度会员';
      default:
        return '免费用户';
    }
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.value, required this.label});
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 14),
      decoration: BoxDecoration(
          color: c.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16)),
      child: Column(
        children: [
          Text(value,
              style: tt.titleLarge
                  ?.copyWith(fontWeight: FontWeight.bold, color: c.primary)),
          const SizedBox(height: 2),
          Text(label, style: tt.bodySmall?.copyWith(color: c.outline)),
        ],
      ),
    );
  }
}

class _Entry extends StatelessWidget {
  const _Entry(this.icon, this.label, this.onTap);
  final IconData icon;
  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: c.primary, size: 26),
            const SizedBox(height: 4),
            Text(label, style: tt.bodySmall),
          ],
        ),
      ),
    );
  }
}
