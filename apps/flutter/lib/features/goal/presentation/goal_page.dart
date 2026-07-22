import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design_system/app_card.dart';
import '../data/goal_models.dart';
import 'goal_controller.dart';

/// 跑步目标：列表（进度条 + 剩余天数 + 完成态）+ 滑动删除 + 添加（Dialog）。
class GoalPage extends ConsumerWidget {
  const GoalPage({super.key});

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final result = await showDialog<AddGoalRequest>(
      context: context,
      builder: (_) => const _AddGoalDialog(),
    );
    if (result == null) return;
    try {
      await ref.read(goalProvider.notifier).add(result);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('目标已添加')));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(goalProvider);
    final c = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('跑步目标'),
        actions: [
          IconButton(tooltip: '里程碑', icon: const Icon(Icons.flag_outlined), onPressed: () => context.push('/milestones')),
          IconButton(
              tooltip: '刷新',
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.read(goalProvider.notifier).refresh()),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('加载失败', style: TextStyle(color: c.error)),
              const SizedBox(height: 8),
              FilledButton(
                  onPressed: () => ref.read(goalProvider.notifier).refresh(),
                  child: const Text('重试')),
            ],
          ),
        ),
        data: (goals) => _body(context, ref, goals, c),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _add(context, ref),
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _body(BuildContext context, WidgetRef ref, List<Goal> goals, ColorScheme c) {
    if (goals.isEmpty) {
      return ListView(padding: const EdgeInsets.all(16), children: [
        AppCard(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Center(
                child: Text('还没有目标，点 + 添加',
                    style: TextStyle(color: c.outline))),
          ),
        ),
      ]);
    }
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        ...goals.map((g) => Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: Dismissible(
                key: ValueKey(g.id),
                direction: DismissDirection.endToStart,
                background: Container(
                  alignment: Alignment.centerRight,
                  padding: const EdgeInsets.only(right: 20),
                  decoration: BoxDecoration(
                      color: Colors.red,
                      borderRadius: BorderRadius.circular(16)),
                  child: const Icon(Icons.delete, color: Colors.white),
                ),
                onDismissed: (_) async {
                  await ref.read(goalProvider.notifier).remove(g.id);
                  if (!context.mounted) return;
                  ScaffoldMessenger.of(context)
                      .showSnackBar(const SnackBar(content: Text('已删除')));
                },
                child: _GoalCard(goal: g),
              ),
            )),
      ],
    );
  }
}

class _GoalCard extends StatelessWidget {
  const _GoalCard({required this.goal});
  final Goal goal;

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    final days = goal.daysLeft;
    final color =
        goal.completed ? Colors.green : (days < 0 ? Colors.grey : c.primary);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                  child: Text(goal.displayName,
                      style: tt.titleMedium
                          ?.copyWith(fontWeight: FontWeight.bold))),
              if (goal.completed) _tag(Colors.green, '已达成'),
            ],
          ),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: goal.progress,
                    minHeight: 10,
                    backgroundColor: c.surfaceContainerHighest,
                    valueColor: AlwaysStoppedAnimation(color),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text('${goal.percent}%',
                  style: tt.bodyMedium
                      ?.copyWith(fontWeight: FontWeight.bold, color: color)),
            ],
          ),
          const SizedBox(height: 8),
          Text(
              '${goal.currentDistance.toStringAsFixed(1)} / ${goal.targetDistance.toStringAsFixed(0)} km',
              style: tt.bodySmall?.copyWith(color: c.outline)),
          if (!goal.completed) ...[
            const SizedBox(height: 4),
            Text(days >= 0 ? '剩余 $days 天' : '已过期',
                style: tt.bodySmall
                    ?.copyWith(color: days < 0 ? Colors.red : c.outline)),
          ],
        ],
      ),
    );
  }

  Widget _tag(Color bg, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(8)),
        child: Text(text, style: const TextStyle(fontSize: 10, color: Colors.white)),
      );
}

class _AddGoalDialog extends StatefulWidget {
  const _AddGoalDialog();
  @override
  State<_AddGoalDialog> createState() => _AddGoalDialogState();
}

class _AddGoalDialogState extends State<_AddGoalDialog> {
  String _type = 'month';
  final _target = TextEditingController();
  final _title = TextEditingController();

  static const _types = [('month', '月度'), ('quarter', '季度'), ('year', '年度')];

  @override
  void dispose() {
    _target.dispose();
    _title.dispose();
    super.dispose();
  }

  void _submit() {
    final t = double.tryParse(_target.text.trim());
    if (t == null || t < 1 || t > 10000) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('目标距离需 1-10000 km')));
      return;
    }
    Navigator.of(context).pop(AddGoalRequest(
      type: _type,
      targetDistance: t,
      title: _title.text.trim().isEmpty ? null : _title.text.trim(),
    ));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('添加目标'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text('周期'),
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: _types
                  .map((t) => ChoiceChip(
                        label: Text(t.$2),
                        selected: _type == t.$1,
                        onSelected: (_) => setState(() => _type = t.$1),
                      ))
                  .toList(),
            ),
            const SizedBox(height: 12),
            TextField(
                controller: _target,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: '目标距离 km（1-10000）',
                    border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: _title,
                decoration: const InputDecoration(
                    labelText: '标题（选填）', border: OutlineInputBorder())),
          ],
        ),
      ),
      actions: [
        TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('取消')),
        FilledButton(onPressed: _submit, child: const Text('添加')),
      ],
    );
  }
}
