import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app/router.dart';
import 'features/auth/presentation/auth_controller.dart';

/// 启动：先恢复会话（有 token 则 me 刷新，无则保持未登录），再渲染。
///
/// 批 1 KISS：await 启动（网络慢时短暂黑屏可接受）；批 2 加 splash + 异步恢复。
Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final container = ProviderContainer();
  await container.read(authProvider.notifier).restoreSession();
  runApp(UncontrolledProviderScope(
    container: container,
    child: const MuheApp(),
  ));
}

/// 沐禾健康 APP 根（M3 Expressive + 沐禾绿 #2D9D78 + 浅深可切 + go_router）。
class MuheApp extends ConsumerWidget {
  const MuheApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    const seed = Color(0xFF2D9D78);
    final router = ref.watch(routerProvider);
    return MaterialApp.router(
      title: '沐禾健康',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: seed),
        useMaterial3: true,
      ),
      darkTheme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: seed,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      routerConfig: router,
    );
  }
}
