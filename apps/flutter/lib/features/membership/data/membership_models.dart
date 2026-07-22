// 会员中心模型（与后端 distribution.inviteInfo / user.redeemMember 对齐）。

class InviteInfo {
  const InviteInfo({
    this.inviteCode = '',
    this.invitePath = '',
    this.shareTitle = '',
    this.rules = const [],
  });
  final String inviteCode;
  final String invitePath; // 小程序路径（Flutter 仅展示 inviteCode）
  final String shareTitle;
  final List<String> rules;

  factory InviteInfo.fromJson(Map<String, dynamic> j) => InviteInfo(
        inviteCode: (j['inviteCode'] as String?) ?? '',
        invitePath: (j['invitePath'] as String?) ?? '',
        shareTitle: (j['shareTitle'] as String?) ?? '',
        rules: ((j['rules'] as List?) ?? const []).map((e) => e.toString()).toList(),
      );
}

class RedeemResult {
  const RedeemResult({this.ok = false, this.days = 0, this.pointsCost = 0});
  final bool ok;
  final int days;
  final int pointsCost;

  factory RedeemResult.fromJson(Map<String, dynamic> j) => RedeemResult(
        ok: (j['ok'] as bool?) ?? false,
        days: (j['days'] as num?)?.toInt() ?? 0,
        pointsCost: (j['pointsCost'] as num?)?.toInt() ?? 0,
      );
}

/// 积分兑换会员套餐（与后端 REDEEM_PACKAGES 对齐：7天100分 / 30天300分）。
class RedeemPackage {
  const RedeemPackage({required this.days, required this.pointsCost, required this.label});
  final int days;
  final int pointsCost;
  final String label;
}

const kRedeemPackages = <RedeemPackage>[
  RedeemPackage(days: 7, pointsCost: 100, label: '7 天会员'),
  RedeemPackage(days: 30, pointsCost: 300, label: '30 天会员'),
];
