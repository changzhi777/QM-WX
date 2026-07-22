// 跑步目标模型（与后端 goal.list / goal.add 对齐）。

class Goal {
  const Goal({
    required this.id,
    required this.type,
    this.title,
    required this.targetDistance,
    this.currentDistance = 0,
    this.percent = 0,
    this.status = 'active',
    required this.periodStart,
    required this.periodEnd,
    this.completed = false,
  });

  final String id;
  final String type; // month / quarter / year / custom
  final String? title;
  final double targetDistance;
  final double currentDistance;
  final int percent; // 0-100
  final String status;
  final String periodStart; // ISO
  final String periodEnd; // ISO
  final bool completed;

  factory Goal.fromJson(Map<String, dynamic> j) => Goal(
        id: j['id'] as String,
        type: (j['type'] as String?) ?? 'month',
        title: j['title'] as String?,
        targetDistance: (j['targetDistance'] as num?)?.toDouble() ?? 0,
        currentDistance: (j['currentDistance'] as num?)?.toDouble() ?? 0,
        percent: (j['percent'] as num?)?.toInt() ?? 0,
        status: (j['status'] as String?) ?? 'active',
        periodStart: (j['periodStart'] as String?) ?? '',
        periodEnd: (j['periodEnd'] as String?) ?? '',
        completed: (j['completed'] as bool?) ?? false,
      );

  /// 展示名：title 优先，回退 类型标签
  String get displayName =>
      (title ?? '').isNotEmpty ? title! : typeLabel;

  String get typeLabel => const {
        'month': '月度目标',
        'quarter': '季度目标',
        'year': '年度目标',
        'custom': '自定义目标',
      }[type] ??
      '目标';

  double get progress => (percent / 100).clamp(0.0, 1.0);

  /// 剩余天数（periodEnd - now；负数表已过期）
  int get daysLeft {
    if (periodEnd.isEmpty) return 0;
    try {
      return DateTime.parse(periodEnd).difference(DateTime.now()).inDays;
    } catch (_) {
      return 0;
    }
  }
}

class AddGoalRequest {
  const AddGoalRequest({
    required this.type,
    required this.targetDistance,
    this.title,
  });

  final String type; // month / quarter / year
  final double targetDistance;
  final String? title;

  Map<String, dynamic> toJson() {
    final m = <String, dynamic>{
      'type': type,
      'targetDistance': targetDistance,
    };
    final t = title;
    if (t != null && t.isNotEmpty) m['title'] = t;
    return m;
  }
}

/// 自定义里程碑（User.customMilestones，全局非 goal 子）
class CustomMilestone {
  const CustomMilestone({required this.km, required this.title, this.icon});
  final double km;
  final String title;
  final String? icon;

  factory CustomMilestone.fromJson(Map<String, dynamic> j) => CustomMilestone(
        km: (j['km'] as num?)?.toDouble() ?? 0,
        title: (j['title'] as String?) ?? '',
        icon: j['icon'] as String?,
      );
}

class AddCustomMilestoneRequest {
  const AddCustomMilestoneRequest({required this.km, required this.title});
  final double km;
  final String title;
  Map<String, dynamic> toJson() => {'km': km, 'title': title};
}
