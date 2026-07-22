import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/group_models.dart';
import '../data/group_remote.dart';

/// 跑群列表控制器：myGroups + create/join 后刷新。
class GroupController extends AsyncNotifier<List<Group>> {
  @override
  Future<List<Group>> build() => GroupRemote.myGroups();

  Future<void> createGroup(String name) async {
    await GroupRemote.createGroup(name);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(GroupRemote.myGroups);
  }

  Future<void> joinGroup(String groupId) async {
    await GroupRemote.joinGroup(groupId);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(GroupRemote.myGroups);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(GroupRemote.myGroups);
  }
}

final groupProvider = AsyncNotifierProvider<GroupController, List<Group>>(GroupController.new);

/// 群详情（family by groupId）
final groupDetailProvider = FutureProvider.family<GroupDetail, String>(
    (ref, groupId) => GroupRemote.groupDetail(groupId));

/// 群榜单（family by groupId）
final groupRankingProvider = FutureProvider.family<List<GroupRankEntry>, String>(
    (ref, groupId) => GroupRemote.groupRanking(groupId));
