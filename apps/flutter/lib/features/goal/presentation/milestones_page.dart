import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import 'goal_controller.dart';

/// 自定义里程碑页：用户全局跑步里程里程碑 + add。
class MilestonesPage extends ConsumerWidget {
  const MilestonesPage({super.key});

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final result = await showDialog<({double km, String title})>(
      context: context,
      builder: (_) => const _AddMilestoneDialog(),
    );
    if (result == null) return;
    try {
      await ref.read(milestoneProvider.notifier).add(result.km, result.title);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('里程碑已添加')));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(milestoneProvider);
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('里程里程碑'),
        actions: [
          IconButton(tooltip: '刷新', icon: const Icon(Icons.refresh), onPressed: () => ref.read(milestoneProvider.notifier).refresh()),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('加载失败', style: TextStyle(color: c.error))),
        data: (list) => list.isEmpty
            ? ListView(padding: const EdgeInsets.all(16), children: [
                AppCard(child: Padding(padding: const EdgeInsets.all(24), child: Center(child: Text('还没有自定义里程碑，点 + 添加', style: TextStyle(color: c.outline))))),
              ])
            : ListView(
                padding: const EdgeInsets.all(16),
                children: list.map((m) => Padding(
                  padding: const EdgeInsets.only(bottom: 10),
                  child: AppCard(
                    child: ListTile(
                      contentPadding: EdgeInsets.zero,
                      leading: CircleAvatar(backgroundColor: c.primaryContainer, child: Text(m.icon?.isNotEmpty == true ? m.icon! : '🏁', style: const TextStyle(fontSize: 18))),
                      title: Text(m.title, style: tt.bodyLarge?.copyWith(fontWeight: FontWeight.bold)),
                      subtitle: Text('${m.km.toStringAsFixed(0)} km', style: tt.bodySmall?.copyWith(color: c.primary)),
                    ),
                  ),
                )).toList(),
              ),
      ),
      floatingActionButton: FloatingActionButton(onPressed: () => _add(context, ref), child: const Icon(Icons.add)),
    );
  }
}

class _AddMilestoneDialog extends StatefulWidget {
  const _AddMilestoneDialog();
  @override
  State<_AddMilestoneDialog> createState() => _AddMilestoneDialogState();
}

class _AddMilestoneDialogState extends State<_AddMilestoneDialog> {
  final _km = TextEditingController();
  final _title = TextEditingController();

  @override
  void dispose() {
    _km.dispose();
    _title.dispose();
    super.dispose();
  }

  void _submit() {
    final km = double.tryParse(_km.text.trim());
    final title = _title.text.trim();
    if (km == null || km < 1 || title.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('公里数 ≥1 + 标题必填')));
      return;
    }
    Navigator.of(context).pop((km: km, title: title));
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('添加里程碑'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(controller: _km, keyboardType: const TextInputType.numberWithOptions(decimal: true), decoration: const InputDecoration(labelText: '目标公里数', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(controller: _title, decoration: const InputDecoration(labelText: '标题（如：首个半马）', border: OutlineInputBorder())),
          ],
        ),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(onPressed: _submit, child: const Text('添加')),
        ],
      );
}
