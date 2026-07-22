import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/goal_models.dart';
import '../data/goal_remote.dart';

/// 跑步目标控制器：list + add/remove 后刷新。
class GoalController extends AsyncNotifier<List<Goal>> {
  @override
  Future<List<Goal>> build() => GoalRemote.list();

  Future<void> add(AddGoalRequest req) async {
    await GoalRemote.add(req);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(GoalRemote.list);
  }

  Future<void> remove(String id) async {
    await GoalRemote.remove(id);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(GoalRemote.list);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(GoalRemote.list);
  }
}

final goalProvider =
    AsyncNotifierProvider<GoalController, List<Goal>>(GoalController.new);
