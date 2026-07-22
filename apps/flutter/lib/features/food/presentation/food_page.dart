import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../data/models.dart';
import '../data/remote.dart';

/// 今日饮食（进页拉一次，下拉/失效刷新）。
final foodDayProvider = FutureProvider<MealDay>((ref) => FoodRemote.myMeals());

/// 饮食记录页：今日宏量汇总（calorie/蛋白质/脂肪/碳水）+ 餐次列表 + 手动记录 FAB。
class FoodPage extends ConsumerStatefulWidget {
  const FoodPage({super.key});
  @override
  ConsumerState<FoodPage> createState() => _FoodPageState();
}

class _FoodPageState extends ConsumerState<FoodPage> {
  Future<void> _add() async {
    final result = await showDialog<({String mealType, MealItem item})>(
      context: context,
      builder: (_) => const _AddMealDialog(),
    );
    if (result == null) return;
    try {
      await FoodRemote.recordMeal(mealType: result.mealType, items: [result.item]);
      ref.invalidate(foodDayProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('已记录')));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    }
  }

  @override
  Widget build(BuildContext context) {
    final async = ref.watch(foodDayProvider);
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(
        title: const Text('饮食记录'),
        actions: [
          IconButton(
            tooltip: '刷新',
            icon: const Icon(Icons.refresh),
            onPressed: () => ref.invalidate(foodDayProvider),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('加载失败', style: TextStyle(color: c.error)),
            const SizedBox(height: 8),
            FilledButton(
              onPressed: () => ref.invalidate(foodDayProvider),
              child: const Text('重试'),
            ),
          ]),
        ),
        data: (day) => RefreshIndicator(
          onRefresh: () async => ref.invalidate(foodDayProvider),
          child: ListView(
            padding: const EdgeInsets.all(16),
            children: [
              // 宏量汇总卡
              AppCard(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(children: [
                    Text(day.summary.calorie.toStringAsFixed(0),
                        style: tt.headlineMedium?.copyWith(
                            fontWeight: FontWeight.bold, color: const Color(0xFF2D9D78))),
                    Text('kcal · ${day.date}',
                        style: tt.bodySmall?.copyWith(color: c.outline)),
                    const SizedBox(height: 12),
                    Row(children: [
                      Expanded(child: _macro(tt, '蛋白质', day.summary.protein)),
                      Expanded(child: _macro(tt, '脂肪', day.summary.fat)),
                      Expanded(child: _macro(tt, '碳水', day.summary.carb)),
                    ]),
                  ]),
                ),
              ),
              const SizedBox(height: 16),
              Text('今日餐次', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
              const SizedBox(height: 8),
              if (day.meals.isEmpty)
                AppCard(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                        child: Text('还没有饮食记录，点 + 添加',
                            style: TextStyle(color: c.outline))),
                  ),
                )
              else
                ...day.meals.map((m) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: AppCard(
                        child: ListTile(
                          contentPadding:
                              const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                          leading: Icon(_mealIcon(m.mealType), color: c.primary),
                          title: Text(mealTypeLabel(m.mealType),
                              style: tt.bodyLarge?.copyWith(fontWeight: FontWeight.bold)),
                          subtitle: Text(
                              '${m.items.map((i) => i.name).join('、')} · ${m.totalCalorie.toStringAsFixed(0)} kcal',
                              style: tt.bodySmall),
                        ),
                      ),
                    )),
            ],
          ),
        ),
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: _add,
        child: const Icon(Icons.add),
      ),
    );
  }

  Widget _macro(TextTheme tt, String label, double value) => Column(children: [
        Text('${value.toStringAsFixed(0)} g',
            style: tt.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
        Text(label, style: tt.bodySmall),
      ]);

  IconData _mealIcon(String t) =>
      const {'breakfast': Icons.free_breakfast, 'lunch': Icons.lunch_dining, 'dinner': Icons.dinner_dining, 'snack': Icons.cookie}[t] ??
      Icons.restaurant;
}

class _AddMealDialog extends StatefulWidget {
  const _AddMealDialog();
  @override
  State<_AddMealDialog> createState() => _AddMealDialogState();
}

class _AddMealDialogState extends State<_AddMealDialog> {
  final _name = TextEditingController();
  final _calorie = TextEditingController();
  String _mealType = 'breakfast';

  @override
  void dispose() {
    _name.dispose();
    _calorie.dispose();
    super.dispose();
  }

  void _submit() {
    final name = _name.text.trim();
    final cal = double.tryParse(_calorie.text.trim());
    if (name.isEmpty || cal == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请填食物名和卡路里')));
      return;
    }
    Navigator.of(context).pop((mealType: _mealType, item: MealItem(name: name, calorie: cal)));
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
        title: const Text('记录饮食'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          DropdownButtonFormField<String>(
            initialValue: _mealType,
            decoration: const InputDecoration(labelText: '餐次', border: OutlineInputBorder()),
            items: const [
              DropdownMenuItem(value: 'breakfast', child: Text('早餐')),
              DropdownMenuItem(value: 'lunch', child: Text('午餐')),
              DropdownMenuItem(value: 'dinner', child: Text('晚餐')),
              DropdownMenuItem(value: 'snack', child: Text('加餐')),
            ],
            onChanged: (v) => setState(() => _mealType = v ?? 'breakfast'),
          ),
          const SizedBox(height: 12),
          TextField(
              controller: _name,
              decoration: const InputDecoration(labelText: '食物名', border: OutlineInputBorder())),
          const SizedBox(height: 12),
          TextField(
              controller: _calorie,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(labelText: '卡路里 kcal', border: OutlineInputBorder())),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.of(context).pop(), child: const Text('取消')),
          FilledButton(onPressed: _submit, child: const Text('记录')),
        ],
      );
}
