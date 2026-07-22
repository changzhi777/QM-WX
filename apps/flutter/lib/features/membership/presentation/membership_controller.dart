import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/membership_models.dart';
import '../data/membership_remote.dart';

/// 邀请信息 FutureProvider。
final inviteProvider = FutureProvider<InviteInfo>((ref) async {
  return MembershipRemote.inviteInfo();
});
