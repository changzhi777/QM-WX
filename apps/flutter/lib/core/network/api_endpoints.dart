/// API 端点常量（与后端 packages/shared ENDPOINTS 对齐）。
///
/// 批 1 仅 auth + user.me；批 2+ 按需扩展（today/checkin/aiCoach/...）。
class ApiEndpoints {
  ApiEndpoints._();

  // ===== auth module（/api/auth/*）=====
  /// 统一登录入口（public）：body { method, payload }
  static const String authLogin = '/api/auth/login';

  /// refresh token 轮换（public）：body { refreshToken }
  static const String authRefresh = '/api/auth/refresh';

  // ===== user module（POST /api/user，body { action, ... }）=====
  static const String userBase = '/api/user';
  static const String actionMe = 'me';

  // ===== stats module（POST /api/stats，body { action, ...payload }）=====
  static const String statsBase = '/api/stats';
  static const String actionHealthScore = 'healthScore';
  static const String actionDailyReport = 'dailyReport';
  static const String actionWeather = 'weather';
  static const String actionMyRunnerStats = 'myRunnerStats';
  static const String actionMyAnnualReport = 'myAnnualReport';
  static const String actionUserProfile = 'userProfile';
  static const String actionMyCertificates = 'myCertificates';

  // ===== strength module（POST /api/strength，body { action, payload }）=====
  static const String strengthBase = '/api/strength';
  static const String actionStrengthListSessions = 'listSessions';
  static const String actionStrengthMyVolume = 'myVolume';
  static const String actionStrengthStartSession = 'startSession';
  static const String actionStrengthAddSet = 'addSet';
  static const String actionStrengthFinishSession = 'finishSession';

  // ===== food module（POST /api/food，body { action, payload }）=====
  static const String foodBase = '/api/food';
  static const String actionFoodMyMeals = 'myMeals';
  static const String actionFoodRecordMeal = 'recordMeal';

  // ===== ai-coach module（POST /api/ai-coach，body { action, payload }）=====
  static const String aiCoachBase = '/api/ai-coach';
  static const String actionAiChat = 'chat';

  // ===== feed module（POST /api/feed，body { action, payload }）=====
  static const String feedBase = '/api/feed';
  static const String actionFeedList = 'list';
  static const String actionFeedPublish = 'publish';
  static const String actionFeedLike = 'like';
  static const String actionFeedUnlike = 'unlike';
  static const String actionFeedListComments = 'listComments';
  static const String actionFeedComment = 'comment';

  // ===== distribution module（POST /api/distribution）=====
  static const String distributionBase = '/api/distribution';
  static const String actionInviteInfo = 'inviteInfo';

  // user module 补充 action（POST /api/user）
  static const String actionRedeemMember = 'redeemMember';

  // ===== notification module（POST /api/notification）=====
  static const String notificationBase = '/api/notification';
  static const String actionNotifList = 'list';
  static const String actionNotifUnreadCount = 'unreadCount';
  static const String actionNotifMarkRead = 'markRead';
  static const String actionNotifMarkAllRead = 'markAllRead';

  // ===== sport module（POST /api/sport，body { action, payload }）=====
  static const String sportBase = '/api/sport';
  static const String actionCheckin = 'checkin';
  static const String actionMyGroups = 'myGroups';
  static const String actionCreateGroup = 'createGroup';
  static const String actionJoinGroup = 'joinGroup';
  static const String actionGroupDetail = 'groupDetail';
  static const String actionGroupRanking = 'groupRanking';

  // ===== shoes module（POST /api/shoes，body { action, payload }）=====
  static const String shoesBase = '/api/shoes';
  static const String actionShoesList = 'list';
  static const String actionShoesAdd = 'add';
  static const String actionShoesGetDetail = 'getDetail';
  static const String actionShoesGetMileageHistory = 'getMileageHistory';

  // ===== goal module（POST /api/goal，body { action, payload }）=====
  static const String goalBase = '/api/goal';
  static const String actionGoalList = 'list';
  static const String actionGoalAdd = 'add';
  static const String actionGoalRemove = 'remove';
  static const String actionListCustomMilestones = 'listCustomMilestones';
  static const String actionAddCustomMilestone = 'addCustomMilestone';
  static const String actionRemoveCustomMilestone = 'removeCustomMilestone';

  /// 判断是否公开路由（不带 Bearer token）
  static bool isPublic(String path) =>
      path == authLogin || path == authRefresh;
}
