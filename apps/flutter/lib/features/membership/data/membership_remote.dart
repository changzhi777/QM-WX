import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'membership_models.dart';

/// 会员中心远程数据源：inviteInfo / redeemMember。
class MembershipRemote {
  MembershipRemote._();

  static Future<InviteInfo> inviteInfo() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.distributionBase,
      ApiEndpoints.actionInviteInfo,
    );
    return InviteInfo.fromJson(data);
  }

  /// 兑换会员：按 days 匹配套餐（后端 find by days）。
  static Future<RedeemResult> redeemMember(int days) async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.userBase,
      ApiEndpoints.actionRedeemMember,
      payload: {'days': days},
    );
    return RedeemResult.fromJson(data);
  }
}
