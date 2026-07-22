// Smoke tests：MainShell + Checkin + Track + Profile + Shoes + Goal + Insight + AiCoach + Feed。

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:muhehealth/app/main_shell.dart';
import 'package:muhehealth/features/agreement/agreement_page.dart';
import 'package:muhehealth/features/ai_coach/presentation/ai_coach_page.dart';
import 'package:muhehealth/features/checkin/presentation/checkin_page.dart';
import 'package:muhehealth/features/certificates/data/models.dart';
import 'package:muhehealth/features/certificates/presentation/certificates_page.dart';
import 'package:muhehealth/features/daily_report/presentation/daily_report_page.dart';
import 'package:muhehealth/features/strength/data/models.dart';
import 'package:muhehealth/features/strength/presentation/strength_page.dart';
import 'package:muhehealth/features/feed/data/feed_models.dart';
import 'package:muhehealth/features/feed/presentation/feed_controller.dart';
import 'package:muhehealth/features/favorite/presentation/favorite_page.dart';
import 'package:muhehealth/features/feed/presentation/feed_page.dart';
import 'package:muhehealth/features/follow/presentation/follow_page.dart';
import 'package:muhehealth/features/food/data/models.dart';
import 'package:muhehealth/features/food/presentation/food_page.dart';
import 'package:muhehealth/features/goal/data/goal_models.dart';
import 'package:muhehealth/features/goal/presentation/goal_controller.dart';
import 'package:muhehealth/features/goal/presentation/goal_page.dart';
import 'package:muhehealth/features/group/data/group_models.dart';
import 'package:muhehealth/features/group/presentation/group_controller.dart';
import 'package:muhehealth/features/group/presentation/group_page.dart';
import 'package:muhehealth/features/gps_track/presentation/track_page.dart';
import 'package:muhehealth/features/insight/presentation/insight_controller.dart';
import 'package:muhehealth/features/insight/presentation/insight_page.dart';
import 'package:muhehealth/features/membership/data/membership_models.dart';
import 'package:muhehealth/features/membership/presentation/membership_controller.dart';
import 'package:muhehealth/features/membership/presentation/membership_page.dart';
import 'package:muhehealth/features/notification/data/notification_models.dart';
import 'package:muhehealth/features/notification/presentation/notification_controller.dart';
import 'package:muhehealth/features/notification/presentation/notification_page.dart';
import 'package:muhehealth/features/profile/data/runner_stats.dart';
import 'package:muhehealth/features/profile/presentation/profile_controller.dart';
import 'package:muhehealth/features/profile/presentation/profile_page.dart';
import 'package:muhehealth/features/shoes/data/shoe_models.dart';
import 'package:muhehealth/features/shoes/presentation/shoes_controller.dart';
import 'package:muhehealth/features/shoes/presentation/shoes_page.dart';
import 'package:muhehealth/features/today/presentation/today_controller.dart';
import 'package:muhehealth/features/settings/settings_page.dart';

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

class _FakeGroup extends GroupController {
  @override
  Future<List<Group>> build() async => const <Group>[];
}

class _FakeInsight extends InsightController {
  @override
  Future<InsightData> build() async => const InsightData();
}

class _FakeFeed extends FeedController {
  @override
  Future<List<Feed>> build() async => const <Feed>[];
}

class _FakeNotif extends NotificationController {
  @override
  Future<List<AppNotification>> build() async => const <AppNotification>[];
}

void main() {
  testWidgets('MainShell renders 4 tabs', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          todayProvider.overrideWith(() => _FakeToday()),
          profileStatsProvider.overrideWith((ref) async => const RunnerStats()),
          insightProvider.overrideWith(() => _FakeInsight()),
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

  testWidgets('GroupPage renders empty state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [groupProvider.overrideWith(() => _FakeGroup())],
        child: const MaterialApp(home: GroupPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('跑群'), findsOneWidget);
    expect(find.text('还没加入跑群，点 + 创建'), findsOneWidget);
  });

  testWidgets('InsightPage renders empty state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [insightProvider.overrideWith(() => _FakeInsight())],
        child: const MaterialApp(home: InsightPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('数据解读'), findsOneWidget);
    expect(find.text('暂无数据，去运动生成解读'), findsOneWidget);
  });

  testWidgets('AiCoachPage renders empty state', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: AiCoachPage())),
    );
    expect(find.text('健康助理'), findsOneWidget);
    expect(find.text('问问 AI 私教'), findsOneWidget);
  });

  testWidgets('FeedPage renders empty state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [feedProvider.overrideWith(() => _FakeFeed())],
        child: const MaterialApp(home: FeedPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('运动动态'), findsOneWidget);
    expect(find.text('还没有动态，点 + 发布'), findsOneWidget);
  });

  testWidgets('MembershipPage renders', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          inviteProvider.overrideWith((ref) async => const InviteInfo()),
        ],
        child: const MaterialApp(home: MembershipPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('会员中心'), findsOneWidget);
    expect(find.text('积分兑换会员'), findsOneWidget);
  });

  testWidgets('SettingsPage renders entries', (tester) async {
    await tester.pumpWidget(
      const ProviderScope(child: MaterialApp(home: SettingsPage())),
    );
    expect(find.text('设置'), findsOneWidget);
    expect(find.text('用户服务协议'), findsOneWidget);
    expect(find.text('退出登录'), findsOneWidget);
  });

  testWidgets('AgreementPage renders protocol', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: AgreementPage()));
    expect(find.text('用户服务协议'), findsOneWidget);
    expect(find.textContaining('1. 关于我们'), findsOneWidget);
  });

  testWidgets('NotificationPage renders empty state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [notificationProvider.overrideWith(() => _FakeNotif())],
        child: const MaterialApp(home: NotificationPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('消息'), findsOneWidget);
    expect(find.text('暂无消息'), findsOneWidget);
  });

  testWidgets('CertificatesPage renders', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          certificatesProvider.overrideWith((ref) async => const CertificateBundle(
                totalDistance: 0,
                totalCheckins: 0,
                milestones: [],
                marathons: [],
              )),
        ],
        child: const MaterialApp(home: CertificatesPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('我的成就'), findsOneWidget);
    expect(find.text('累计 km'), findsOneWidget);
    expect(find.text('还没有证书，继续跑起来解锁成就！'), findsOneWidget);
  });

  testWidgets('StrengthPage renders empty state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          strengthSessionsProvider.overrideWith((ref) async => const []),
          strengthVolumeProvider.overrideWith(
              (ref) async => const VolumeSummary(totalSessions: 0, totalVolume: 0, days: 30)),
        ],
        child: const MaterialApp(home: StrengthPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('力量训练'), findsOneWidget);
    expect(find.text('还没有力量训练记录'), findsOneWidget);
  });

  testWidgets('FoodPage renders empty state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          foodDayProvider.overrideWith((ref) async => MealDay(
                date: '2026-07-23',
                meals: const [],
                summary: const MealSummary(calorie: 0, protein: 0, fat: 0, carb: 0),
              )),
        ],
        child: const MaterialApp(home: FoodPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('饮食记录'), findsOneWidget);
    expect(find.text('还没有饮食记录，点 + 添加'), findsOneWidget);
  });

  testWidgets('DailyReportPage renders empty state', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          dailyReportsProvider.overrideWith((ref) async => const []),
        ],
        child: const MaterialApp(home: DailyReportPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('每日报告'), findsOneWidget);
    expect(find.text('还没有历史报告，运动后自动生成'), findsOneWidget);
  });

  testWidgets('FollowPage renders empty following', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          followingProvider.overrideWith((ref) async => const []),
          followersProvider.overrideWith((ref) async => const []),
        ],
        child: const MaterialApp(home: FollowPage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('关注'), findsWidgets);
    expect(find.text('还没有关注的人'), findsOneWidget);
  });

  testWidgets('FavoritePage renders empty', (tester) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [favoritesProvider.overrideWith((ref) async => const [])],
        child: const MaterialApp(home: FavoritePage()),
      ),
    );
    await tester.pump();
    await tester.pump();
    expect(find.text('我的收藏'), findsOneWidget);
    expect(find.text('还没有收藏'), findsOneWidget);
  });
}
