import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'goal_models.dart';

/// 跑步目标远程数据源：list / add / remove。
class GoalRemote {
  GoalRemote._();

  static Future<List<Goal>> list() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.goalBase,
      ApiEndpoints.actionGoalList,
    );
    final arr = (data['goals'] as List?) ?? const [];
    return arr.map((e) => Goal.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<void> add(AddGoalRequest req) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.goalBase,
      ApiEndpoints.actionGoalAdd,
      payload: req.toJson(),
    );
  }

  static Future<void> remove(String id) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.goalBase,
      ApiEndpoints.actionGoalRemove,
      payload: {'id': id},
    );
  }

  /// 自定义里程碑列表（用户全局）
  static Future<List<CustomMilestone>> listCustomMilestones() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.goalBase,
      ApiEndpoints.actionListCustomMilestones,
    );
    final arr = (data['milestones'] as List?) ?? const [];
    return arr.map((e) => CustomMilestone.fromJson(e as Map<String, dynamic>)).toList();
  }

  static Future<void> addCustomMilestone(double km, String title) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.goalBase,
      ApiEndpoints.actionAddCustomMilestone,
      payload: {'km': km, 'title': title},
    );
  }
}
