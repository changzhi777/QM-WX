// Smoke tests：MainShell 4-tab + CheckinPage 表单 + TrackPage idle 渲染。
// override todayProvider 避免 TodayPage 触发真实网络请求。

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:muhehealth/app/main_shell.dart';
import 'package:muhehealth/features/checkin/presentation/checkin_page.dart';
import 'package:muhehealth/features/gps_track/presentation/track_page.dart';
import 'package:muhehealth/features/today/presentation/today_controller.dart';

class _FakeToday extends TodayController {
  @override
  Future<TodayData> build() async => const TodayData();
}

void main() {
  testWidgets('MainShell renders 4 tabs', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [todayProvider.overrideWith(() => _FakeToday())],
        child: const MaterialApp(home: MainShell()),
      ),
    );
    await tester.pump(); // flush microtask（_FakeToday 完成，loading→data）
    expect(find.byType(NavigationDestination), findsNWidgets(4));
    expect(find.text('今日'), findsWidgets);
  });

  testWidgets('CheckinPage renders form fields', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: CheckinPage())),
    );
    expect(find.text('运动信息'), findsOneWidget);
    expect(find.text('提交打卡'), findsOneWidget);
    // 4 个运动类型 chip（run/ride/walk/swim）
    expect(find.byType(ChoiceChip), findsNWidgets(4));
  });

  testWidgets('TrackPage idle renders start button', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: TrackPage())),
    );
    expect(find.text('开始跑步'), findsOneWidget);
    expect(find.byIcon(Icons.play_arrow), findsOneWidget);
  });
}
