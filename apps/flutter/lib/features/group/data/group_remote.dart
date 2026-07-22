import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'group_models.dart';

/// 跑群远程数据源：myGroups / createGroup / joinGroup / groupDetail / groupRanking。
class GroupRemote {
  GroupRemote._();

  static Future<List<Group>> myGroups() async {
    final data = await ApiClient.instance.postAction(ApiEndpoints.sportBase, ApiEndpoints.actionMyGroups);
    final arr = (data as List?) ?? const [];
    return arr.map((e) => Group.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<void> createGroup(String name) async {
    await ApiClient.instance.postAction(ApiEndpoints.sportBase, ApiEndpoints.actionCreateGroup, payload: {'name': name});
  }

  static Future<void> joinGroup(String groupId) async {
    await ApiClient.instance.postAction(ApiEndpoints.sportBase, ApiEndpoints.actionJoinGroup, payload: {'groupId': groupId});
  }

  static Future<GroupDetail> groupDetail(String groupId) async {
    final data = await ApiClient.instance.postAction(ApiEndpoints.sportBase, ApiEndpoints.actionGroupDetail, payload: {'groupId': groupId});
    return GroupDetail.fromJson(data);
  }

  static Future<List<GroupRankEntry>> groupRanking(String groupId, {String period = 'week'}) async {
    final data = await ApiClient.instance.postAction(ApiEndpoints.sportBase, ApiEndpoints.actionGroupRanking, payload: {'groupId': groupId, 'period': period});
    final arr = (data['list'] as List?) ?? (data as List?) ?? const [];
    return arr.map((e) => GroupRankEntry.fromJson(e as Map<String, dynamic>)).toList();
  }
}
