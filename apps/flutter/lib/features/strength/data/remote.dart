import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'models.dart';

/// 力量训练远程数据源：listSessions（历史）+ myVolume（容量趋势）。
class StrengthRemote {
  StrengthRemote._();

  static Future<List<StrengthSession>> listSessions() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.strengthBase,
      ApiEndpoints.actionStrengthListSessions,
    );
    final list = (data['list'] as List?) ?? const [];
    return list
        .map((e) => StrengthSession.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<VolumeSummary> myVolume() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.strengthBase,
      ApiEndpoints.actionStrengthMyVolume,
    );
    return VolumeSummary.fromJson(data);
  }

  /// 开始训练 → sessionId
  static Future<String> startSession() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.strengthBase,
      ApiEndpoints.actionStrengthStartSession,
    );
    return (data['id'] as String?) ?? '';
  }

  /// 记录一组
  static Future<void> addSet({
    required String sessionId,
    required String exerciseName,
    required int reps,
    required double weight,
    required int setIndex,
  }) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.strengthBase,
      ApiEndpoints.actionStrengthAddSet,
      payload: {
        'sessionId': sessionId,
        'exerciseName': exerciseName,
        'reps': reps,
        'weight': weight,
        'setIndex': setIndex,
      },
    );
  }

  /// 完成训练
  static Future<void> finishSession({
    required String sessionId,
    required int durationSec,
    String? notes,
  }) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.strengthBase,
      ApiEndpoints.actionStrengthFinishSession,
      payload: {
        'sessionId': sessionId,
        'durationSec': durationSec,
        'notes': notes,
      },
    );
  }
}
