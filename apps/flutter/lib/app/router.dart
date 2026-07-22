import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/agreement/agreement_page.dart';
import '../features/auth/presentation/auth_controller.dart';
import '../features/auth/presentation/login_page.dart';
import '../features/checkin/presentation/checkin_page.dart';
import '../features/feed/data/feed_models.dart';
import '../features/feed/presentation/feed_detail_page.dart';
import '../features/feed/presentation/feed_page.dart';
import '../features/goal/presentation/goal_page.dart';
import '../features/goal/presentation/milestones_page.dart';
import '../features/group/presentation/group_detail_page.dart';
import '../features/group/presentation/group_page.dart';
import '../features/gps_track/presentation/track_page.dart';
import '../features/membership/presentation/membership_page.dart';
import '../features/certificates/presentation/certificates_page.dart';
import '../features/notification/presentation/notification_page.dart';
import '../features/settings/settings_page.dart';
import '../features/shoes/presentation/shoes_detail_page.dart';
import '../features/shoes/presentation/shoes_page.dart';
import 'main_shell.dart';

/// 把 Riverpod [authProvider] 的变化桥接到 go_router `refreshListenable`。
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(Ref ref) {
    ref.listen<AsyncValue<AuthState>>(authProvider, (_, _) {
      notifyListeners();
    });
  }
}

/// 全局路由：登录守卫 + 主壳 + 子页。
final routerProvider = Provider<GoRouter>((ref) {
  final listenable = _AuthListenable(ref);
  ref.onDispose(listenable.dispose);

  return GoRouter(
    initialLocation: '/',
    refreshListenable: listenable,
    redirect: (context, state) {
      final auth = ref.read(authProvider);
      final loggedIn = auth.value?.authenticated ?? false;
      final ready = auth.hasValue && !auth.isLoading;
      final goingLogin = state.matchedLocation == '/login';
      if (!ready) return null;
      if (!loggedIn && !goingLogin) return '/login';
      if (loggedIn && goingLogin) return '/';
      return null;
    },
    routes: [
      GoRoute(path: '/login', builder: (_, _) => const LoginPage()),
      GoRoute(path: '/', builder: (_, _) => const MainShell()),
      GoRoute(path: '/checkin', builder: (_, _) => const CheckinPage()),
      GoRoute(path: '/track', builder: (_, _) => const TrackPage()),
      GoRoute(path: '/shoes', builder: (_, _) => const ShoesPage()),
      GoRoute(path: '/shoes/detail', builder: (_, state) => ShoesDetailPage(shoeId: state.uri.queryParameters['id'] ?? '')),
      GoRoute(path: '/goals', builder: (_, _) => const GoalPage()),
      GoRoute(path: '/milestones', builder: (_, _) => const MilestonesPage()),
      GoRoute(path: '/groups', builder: (_, _) => const GroupPage()),
      GoRoute(path: '/group-detail', builder: (_, state) => GroupDetailPage(groupId: state.uri.queryParameters['id'] ?? '')),
      GoRoute(path: '/feed', builder: (_, _) => const FeedPage()),
      GoRoute(path: '/feed/detail', builder: (_, state) => FeedDetailPage(feed: state.extra as Feed)),
      GoRoute(path: '/membership', builder: (_, _) => const MembershipPage()),
      GoRoute(path: '/certificates', builder: (_, _) => const CertificatesPage()),
      GoRoute(path: '/settings', builder: (_, _) => const SettingsPage()),
      GoRoute(path: '/agreement', builder: (_, _) => const AgreementPage()),
      GoRoute(path: '/notifications', builder: (_, _) => const NotificationPage()),
    ],
  );
});
