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

/// 自定义里程碑列表（用户全局，add 后刷新）
class MilestoneController extends AsyncNotifier<List<CustomMilestone>> {
  @override
  Future<List<CustomMilestone>> build() => GoalRemote.listCustomMilestones();

  Future<void> add(double km, String title) async {
    await GoalRemote.addCustomMilestone(km, title);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(GoalRemote.listCustomMilestones);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(GoalRemote.listCustomMilestones);
  }
}

final milestoneProvider =
    AsyncNotifierProvider<MilestoneController, List<CustomMilestone>>(MilestoneController.new);
