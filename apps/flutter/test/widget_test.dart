// Smoke tests：MainShell + Checkin + Track + Profile + Shoes + Goal。
// override todayProvider/profileStatsProvider/shoesProvider/goalProvider 避免真实网络。

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:muhehealth/app/main_shell.dart';
import 'package:muhehealth/features/checkin/presentation/checkin_page.dart';
import 'package:muhehealth/features/goal/data/goal_models.dart';
import 'package:muhehealth/features/goal/presentation/goal_controller.dart';
import 'package:muhehealth/features/goal/presentation/goal_page.dart';
import 'package:muhehealth/features/gps_track/presentation/track_page.dart';
import 'package:muhehealth/features/profile/data/runner_stats.dart';
import 'package:muhehealth/features/profile/presentation/profile_controller.dart';
import 'package:muhehealth/features/profile/presentation/profile_page.dart';
import 'package:muhehealth/features/shoes/data/shoe_models.dart';
import 'package:muhehealth/features/shoes/presentation/shoes_controller.dart';
import 'package:muhehealth/features/shoes/presentation/shoes_page.dart';
import 'package:muhehealth/features/today/presentation/today_controller.dart';

class _FakeToday extends TodayController {
  @override
  Future<TodayData> build() async => const TodayData();
}

class _FakeShoes extends ShoesController {
  @override
  Future<List<Shoe>> build() async => const <Shoe>[];
}

class _FakeGoal extends GoalController {
  @override
  Future<List<Goal>> build() async => const <Goal>[];
}

void main() {
  testWidgets('MainShell renders 4 tabs', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          todayProvider.overrideWith(() => _FakeToday()),
          profileStatsProvider.overrideWith((ref) async => const RunnerStats()),
        ],
        child: const MaterialApp(home: MainShell()),
      ),
    );
    await tester.pump();
    expect(find.byType(NavigationDestination), findsNWidgets(4));
    expect(find.text('今日'), findsWidgets);
  });

  testWidgets('CheckinPage renders form fields', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: CheckinPage())),
    );
    expect(find.text('运动信息'), findsOneWidget);
    expect(find.text('提交打卡'), findsOneWidget);
    expect(find.byType(ChoiceChip), findsNWidgets(4));
  });

  testWidgets('TrackPage idle renders start button', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: TrackPage())),
    );
    expect(find.text('开始跑步'), findsOneWidget);
    expect(find.byIcon(Icons.play_arrow), findsOneWidget);
  });

  testWidgets('ProfilePage renders entries + logout', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          profileStatsProvider.overrideWith((ref) async => const RunnerStats()),
        ],
        child: const MaterialApp(home: ProfilePage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('我的'), findsOneWidget);
    expect(find.text('沐禾用户'), findsOneWidget);
    expect(find.text('更多功能'), findsOneWidget);
  });

  testWidgets('ShoesPage renders empty state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [shoesProvider.overrideWith(() => _FakeShoes())],
        child: const MaterialApp(home: ShoesPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('我的跑鞋'), findsOneWidget);
    expect(find.text('还没有跑鞋，点 + 添加'), findsOneWidget);
  });

  testWidgets('GoalPage renders empty state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [goalProvider.overrideWith(() => _FakeGoal())],
        child: const MaterialApp(home: GoalPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('跑步目标'), findsOneWidget);
    expect(find.text('还没有目标，点 + 添加'), findsOneWidget);
  });
}
