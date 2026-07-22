import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design_system/app_card.dart';
import '../data/group_models.dart';
import 'group_controller.dart';

/// 跑群列表：我的群 + 创建群 + 加入群（Dialog）→ 点群进详情。
class GroupPage extends ConsumerWidget {
  const GroupPage({super.key});

  Future<void> _create(BuildContext context, WidgetRef ref) async {
    final name = await _inputDialog(context, title: '创建跑群', label: '群名称', hint: '如：晨跑打卡群');
    if (name == null || name.trim().isEmpty) return;
    try {
      await ref.read(groupProvider.notifier).createGroup(name.trim());
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('群已创建')));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  Future<void> _join(BuildContext context, WidgetRef ref) async {
    final id = await _inputDialog(context, title: '加入跑群', label: '群 ID', hint: '输入群 ID');
    if (id == null || id.trim().isEmpty) return;
    try {
      await ref.read(groupProvider.notifier).joinGroup(id.trim());
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已加入')));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(groupProvider);
    final c = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('跑群'),
        actions: [
          IconButton(tooltip: '加入', icon: const Icon(Icons.group_add_outlined), onPressed: () => _join(context, ref)),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('加载失败', style: TextStyle(color: c.error)),
          const SizedBox(height: 8),
          FilledButton(onPressed: () => ref.read(groupProvider.notifier).refresh(), child: const Text('重试')),
        ])),
        data: (groups) => groups.isEmpty
            ? ListView(padding: const EdgeInsets.all(16), children: [
                AppCard(child: Padding(padding: const EdgeInsets.all(24), child: Center(child: Text('还没加入跑群，点 + 创建', style: TextStyle(color: c.outline))))),
              ])
            : RefreshIndicator(
                onRefresh: () => ref.read(groupProvider.notifier).refresh(),
                child: ListView(padding: const EdgeInsets.all(16), children: groups.map((g) => Padding(padding: const EdgeInsets.only(bottom: 12), child: _GroupCard(group: g))).toList()),
              ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: () => _create(context, ref), child: const Icon(Icons.add)),
    );
  }
}

Future<String?> _inputDialog(BuildContext context, {required String title, required String label, required String hint}) {
  final ctrl = TextEditingController();
  return showDialog<String>(
    context: context,
    builder: (_) => AlertDialog(
      title: Text(title),
      content: TextField(controller: ctrl, autofocus: true, decoration: InputDecoration(labelText: label, hintText: hint, border: const OutlineInputBorder())),
      actions: [
        TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
        FilledButton(onPressed: () => Navigator.of(context).pop(ctrl.text.trim()), child: const Text('确定')),
      ],
    ),
  );
}

class _GroupCard extends StatelessWidget {
  const _GroupCard({required this.group});
  final Group group;

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    return AppCard(
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: CircleAvatar(backgroundColor: c.primaryContainer, child: Icon(Icons.groups, color: c.onPrimaryContainer)),
        title: Text(group.name, style: tt.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
        subtitle: Text('${group.memberCount} 成员 · ${group.isOwner ? "群主" : "成员"}', style: tt.bodySmall?.copyWith(color: c.outline)),
        trailing: const Icon(Icons.chevron_right),
        onTap: () => context.push('/group-detail?id=${group.id}'),
      ),
    );
  }
}
