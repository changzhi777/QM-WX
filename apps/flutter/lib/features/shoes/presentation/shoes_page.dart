import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design_system/app_card.dart';
import '../data/shoe_models.dart';
import 'shoes_controller.dart';

/// 我的跑鞋：统计 + 列表（里程进度+健康色）+ 添加（Dialog）。
class ShoesPage extends ConsumerWidget {
  const ShoesPage({super.key});

  Future<void> _add(BuildContext context, WidgetRef ref) async {
    final result = await showDialog<AddShoeRequest>(
      context: context,
      builder: (_) => const _AddShoeDialog(),
    );
    if (result == null) return;
    try {
      await ref.read(shoesProvider.notifier).add(result);
      if (!context.mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('添加成功')));
    } catch (e) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(shoesProvider);
    final c = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('我的跑鞋'),
        actions: [
          IconButton(
              tooltip: '刷新',
              icon: const Icon(Icons.refresh),
              onPressed: () => ref.read(shoesProvider.notifier).refresh()),
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
                  onPressed: () => ref.read(shoesProvider.notifier).refresh(),
                  child: const Text('重试')),
            ],
          ),
        ),
        data: (shoes) => _body(context, shoes, c),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _add(context, ref),
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _body(BuildContext context, List<Shoe> shoes, ColorScheme c) {
    final active = shoes.where((s) => !s.isRetired).toList();
    final totalKm = active.fold<double>(0, (sum, s) => sum + s.currentKm);
    final needReplace =
        active.where((s) => (s.healthRatio ?? 0) >= 100).length;
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        Row(
          children: [
            Expanded(child: _StatCard(value: '${active.length}', label: '在用', c: c)),
            const SizedBox(width: 12),
            Expanded(child: _StatCard(value: totalKm.toStringAsFixed(0), label: '累计 km', c: c)),
            const SizedBox(width: 12),
            Expanded(child: _StatCard(value: '$needReplace', label: '需更换', c: c)),
          ],
        ),
        const SizedBox(height: 16),
        if (shoes.isEmpty)
          AppCard(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Center(
                  child: Text('还没有跑鞋，点 + 添加',
                      style: TextStyle(color: c.outline))),
            ),
          )
        else
          ...shoes.map((s) => GestureDetector(
                onTap: () => context.push('/shoes/detail?id=${s.id}'),
                child: Padding(padding: const EdgeInsets.only(bottom: 12), child: _ShoeCard(shoe: s)),
              )),
      ],
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.value, required this.label, required this.c});
  final String value;
  final String label;
  final ColorScheme c;

  @override
  Widget build(BuildContext context) {
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

class _ShoeCard extends StatelessWidget {
  const _ShoeCard({required this.shoe});
  final Shoe shoe;

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    final ratio = shoe.healthRatio ?? 0;
    final color =
        ratio < 70 ? Colors.green : (ratio <= 100 ? Colors.orange : Colors.red);
    final progress = shoe.progress.clamp(0.0, 1.0);
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                  child: Text(shoe.displayName,
                      style: tt.titleMedium
                          ?.copyWith(fontWeight: FontWeight.bold))),
              if (shoe.isRetired)
                _tag(c.outline, '已退役')
              else if (ratio >= 100)
                _tag(Colors.red, '建议更换'),
            ],
          ),
          const SizedBox(height: 4),
          Text('${shoe.brand} ${shoe.model}',
              style: tt.bodySmall?.copyWith(color: c.outline)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: progress,
                    minHeight: 8,
                    backgroundColor: c.surfaceContainerHighest,
                    valueColor: AlwaysStoppedAnimation(color),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Text(
                  '${shoe.currentKm.toStringAsFixed(0)} / ${shoe.thresholdKm.toStringAsFixed(0)} km',
                  style: tt.bodySmall?.copyWith(fontWeight: FontWeight.bold)),
            ],
          ),
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

class _AddShoeDialog extends StatefulWidget {
  const _AddShoeDialog();
  @override
  State<_AddShoeDialog> createState() => _AddShoeDialogState();
}

class _AddShoeDialogState extends State<_AddShoeDialog> {
  final _brand = TextEditingController();
  final _model = TextEditingController();
  final _nickname = TextEditingController();
  final _threshold = TextEditingController(text: '800');

  @override
  void dispose() {
    _brand.dispose();
    _model.dispose();
    _nickname.dispose();
    _threshold.dispose();
    super.dispose();
  }

  void _submit() {
    final b = _brand.text.trim();
    final m = _model.text.trim();
    if (b.isEmpty || m.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('请填写品牌和型号')));
      return;
    }
    var th = double.tryParse(_threshold.text.trim()) ?? 800;
    if (th < 100) th = 800;
    if (th > 2000) th = 2000;
    Navigator.of(context).pop(AddShoeRequest(
      brand: b,
      model: m,
      nickname: _nickname.text.trim().isEmpty ? null : _nickname.text.trim(),
      thresholdKm: th,
    ));
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('添加跑鞋'),
      content: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
                controller: _brand,
                decoration: const InputDecoration(
                    labelText: '品牌 *', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: _model,
                decoration: const InputDecoration(
                    labelText: '型号 *', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: _nickname,
                decoration: const InputDecoration(
                    labelText: '昵称（选填）', border: OutlineInputBorder())),
            const SizedBox(height: 12),
            TextField(
                controller: _threshold,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(
                    labelText: '更换阈值 km（100-2000）', border: OutlineInputBorder())),
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
