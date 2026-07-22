import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../features/auth/presentation/auth_controller.dart';
import '../features/auth/presentation/login_page.dart';
import '../features/checkin/presentation/checkin_page.dart';
import '../features/goal/presentation/goal_page.dart';
import '../features/gps_track/presentation/track_page.dart';
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
      GoRoute(path: '/goals', builder: (_, _) => const GoalPage()),
    ],
  );
});
