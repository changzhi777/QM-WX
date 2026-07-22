import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../../auth/presentation/auth_controller.dart';
import '../data/membership_models.dart';
import '../data/membership_remote.dart';
import 'membership_controller.dart';

/// 会员中心：会员状态 + 积分兑换 + 邀请码（复制）+ 邀请规则。
class MembershipPage extends ConsumerStatefulWidget {
  const MembershipPage({super.key});

  @override
  ConsumerState<MembershipPage> createState() => _MembershipPageState();
}

class _MembershipPageState extends ConsumerState<MembershipPage> {
  bool _redeeming = false;

  String _memberLabel(String? level) => switch (level) {
        'monthly' => '月度会员',
        'quarterly' => '季度会员',
        'yearly' => '年度会员',
        _ => '免费用户',
      };

  String _expireLabel(String? iso) {
    if (iso == null || iso.isEmpty) return '未开通';
    try {
      return iso.substring(0, 10);
    } catch (_) {
      return iso;
    }
  }

  Future<void> _redeem(RedeemPackage pkg) async {
    if (_redeeming) return;
    setState(() => _redeeming = true);
    try {
      final r = await MembershipRemote.redeemMember(pkg.days);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content:
              Text('兑换成功：+${r.days} 天会员（-${r.pointsCost} 积分）')));
      ref.invalidate(inviteProvider);
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _redeeming = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final user = ref.watch(authProvider).value?.user;
    final inviteAsync = ref.watch(inviteProvider);
    final tt = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    final points = user?.points ?? 0;
    final isMember = user != null && user.memberLevel != 'free';

    return Scaffold(
      appBar: AppBar(title: const Text('会员中心')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // 会员状态卡
          AppCard(
            child: Row(
              children: [
                Icon(Icons.verified,
                    color: isMember ? c.primary : c.outline, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_memberLabel(user?.memberLevel),
                          style: tt.titleMedium
                              ?.copyWith(fontWeight: FontWeight.bold)),
                      Text('到期：${_expireLabel(user?.memberExpireAt)}',
                          style: tt.bodySmall?.copyWith(color: c.outline)),
                      Text('累计积分 ${user?.totalPointsEarned ?? 0}',
                          style: tt.bodySmall?.copyWith(color: c.outline)),
                    ],
                  ),
                ),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                      color: c.primaryContainer,
                      borderRadius: BorderRadius.circular(20)),
                  child: Text('$points 积分',
                      style: TextStyle(
                          color: c.onPrimaryContainer,
                          fontWeight: FontWeight.bold)),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          Text('积分兑换会员',
              style: tt.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Row(
            children: [
              Expanded(
                  child: _RedeemCard(
                      pkg: kRedeemPackages[0],
                      canAfford: points >= kRedeemPackages[0].pointsCost,
                      loading: _redeeming,
                      onTap: () => _redeem(kRedeemPackages[0]))),
              const SizedBox(width: 12),
              Expanded(
                  child: _RedeemCard(
                      pkg: kRedeemPackages[1],
                      canAfford: points >= kRedeemPackages[1].pointsCost,
                      loading: _redeeming,
                      onTap: () => _redeem(kRedeemPackages[1]))),
            ],
          ),
          const SizedBox(height: 16),
          // 邀请码
          inviteAsync.when(
            loading: () => const Padding(
                padding: EdgeInsets.all(24),
                child: Center(child: CircularProgressIndicator())),
            error: (_, _) => AppCard(
                child: Text('邀请信息加载失败', style: TextStyle(color: c.error))),
            data: (info) => AppCard(
              title: '邀请好友',
              icon: Icons.card_giftcard,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: SelectableText(info.inviteCode,
                            style: tt.titleLarge?.copyWith(
                                fontWeight: FontWeight.bold,
                                color: c.primary,
                                letterSpacing: 2)),
                      ),
                      IconButton(
                        icon: const Icon(Icons.copy),
                        tooltip: '复制邀请码',
                        onPressed: () async {
                          await Clipboard.setData(
                              ClipboardData(text: info.inviteCode));
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text('邀请码已复制')));
                        },
                      ),
                    ],
                  ),
                  if (info.shareTitle.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(info.shareTitle,
                        style: tt.bodySmall?.copyWith(color: c.outline)),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),
          // 邀请规则
          inviteAsync.maybeWhen(
            data: (info) => info.rules.isEmpty
                ? const SizedBox()
                : AppCard(
                    title: '邀请规则',
                    icon: Icons.list,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: info.rules
                          .asMap()
                          .entries
                          .map((e) => Padding(
                                padding: const EdgeInsets.only(bottom: 6),
                                child: Text('${e.key + 1}. ${e.value}',
                                    style: tt.bodySmall),
                              ))
                          .toList(),
                    ),
                  ),
            orElse: () => const SizedBox(),
          ),
          const SizedBox(height: 8),
          Text('积分可通过每日打卡、运动成就、邀请好友等获取',
              style: tt.bodySmall?.copyWith(color: c.outline),
              textAlign: TextAlign.center),
        ],
      ),
    );
  }
}

class _RedeemCard extends StatelessWidget {
  const _RedeemCard({
    required this.pkg,
    required this.canAfford,
    required this.loading,
    required this.onTap,
  });
  final RedeemPackage pkg;
  final bool canAfford;
  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    return AppCard(
      child: Column(
        children: [
          Icon(Icons.star, color: c.primary, size: 28),
          const SizedBox(height: 4),
          Text(pkg.label,
              style:
                  tt.titleMedium?.copyWith(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          FilledButton(
            onPressed: (loading || !canAfford) ? null : onTap,
            child: Text('${pkg.pointsCost} 积分'),
          ),
        ],
      ),
    );
  }
}
