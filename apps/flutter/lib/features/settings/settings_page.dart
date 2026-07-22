import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../auth/presentation/auth_controller.dart';

/// 设置页：用户卡 + 协议/隐私/关于 + 退出登录 + 版本号。
///
/// 批 8 消灭「设置」「关于」2 占位；协议入口落地到 AgreementPage。
class SettingsPage extends ConsumerWidget {
  const SettingsPage({super.key});

  void _toast(BuildContext context, String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _showAbout(BuildContext context) {
    showDialog(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('关于沐禾健康'),
        content: const Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('沐禾健康 v1.0.0',
                style: TextStyle(fontWeight: FontWeight.bold)),
            SizedBox(height: 8),
            Text('湖南青沐生命科技有限公司'),
            Text('运动健康数据解读与健康管理平台', style: TextStyle(fontSize: 13)),
            SizedBox(height: 8),
            Text('邮箱：zhangchen@qingmulife.cn',
                style: TextStyle(fontSize: 12)),
            Text('© 2026 湖南青沐生命科技', style: TextStyle(fontSize: 12)),
          ],
        ),
        actions: [
          TextButton(
              onPressed: () => Navigator.of(context).pop(),
              child: const Text('知道了')),
        ],
      ),
    );
  }

  Widget _item(BuildContext context, IconData icon, String title, Widget? trailing, VoidCallback onTap) {
    final tt = Theme.of(context).textTheme;
    return ListTile(
      leading: Icon(icon),
      title: Text(title, style: tt.bodyLarge),
      trailing: trailing ?? const Icon(Icons.chevron_right, size: 20),
      onTap: onTap,
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(authProvider).value?.user;
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('设置')),
      body: ListView(
        children: [
          // 用户卡
          ListTile(
            leading: CircleAvatar(
              backgroundColor: c.primaryContainer,
              backgroundImage: (user?.avatarUrl ?? '').isNotEmpty
                  ? NetworkImage(user!.avatarUrl!)
                  : null,
              child: (user?.avatarUrl ?? '').isEmpty
                  ? Icon(Icons.person, color: c.onPrimaryContainer)
                  : null,
            ),
            title: Text(user?.displayName ?? '沐禾用户',
                style: tt.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
            subtitle: Text(
                '${user?.growthLevel ?? 'free'} · ${user?.memberLevel ?? 'free'} · ${user?.points ?? 0} 积分',
                style: tt.bodySmall),
          ),
          const Divider(height: 1),
          _item(context, Icons.description_outlined, '用户服务协议', null,
              () => context.push('/agreement')),
          _item(context, Icons.privacy_tip_outlined, '隐私政策', null,
              () => _toast(context, '隐私政策待上线')),
          _item(context, Icons.info_outline, '关于沐禾健康', null,
              () => _showAbout(context)),
          const Divider(height: 1),
          ListTile(
            leading: Icon(Icons.logout, color: c.error),
            title: Text('退出登录', style: TextStyle(color: c.error)),
            onTap: () async {
              await ref.read(authProvider.notifier).logout();
            },
          ),
          const SizedBox(height: 24),
          Center(
            child: Text('沐禾健康 v1.0.0',
                style: tt.bodySmall?.copyWith(color: c.outline)),
          ),
          const SizedBox(height: 8),
          Center(
            child: Text('© 2026 湖南青沐生命科技有限公司',
                style: tt.bodySmall?.copyWith(color: c.outline, fontSize: 11)),
          ),
        ],
      ),
    );
  }
}
