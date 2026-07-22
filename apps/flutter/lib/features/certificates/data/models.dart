/// 成就证书 bundle（后端 stats.myCertificates 返回）。
///
/// 含里程里程碑（累计跑量达标）+ 赛事证书（已报名马拉松）+ 下一里程碑目标。
class CertificateBundle {
  const CertificateBundle({
    required this.totalDistance,
    required this.totalCheckins,
    required this.milestones,
    required this.marathons,
    this.nextMilestone,
  });

  final double totalDistance;
  final int totalCheckins;
  final List<MilestoneCert> milestones; // 已达成的里程碑证书
  final List<MarathonCert> marathons; // 赛事证书
  final MilestoneTarget? nextMilestone; // 下一未达成里程碑

  factory CertificateBundle.fromJson(Map<String, dynamic> j) => CertificateBundle(
        totalDistance: (j['totalDistance'] as num?)?.toDouble() ?? 0,
        totalCheckins: (j['totalCheckins'] as num?)?.toInt() ?? 0,
        milestones: ((j['milestones'] as List?) ?? const [])
            .map((e) => MilestoneCert.fromJson(e as Map<String, dynamic>))
            .toList(),
        marathons: ((j['marathons'] as List?) ?? const [])
            .map((e) => MarathonCert.fromJson(e as Map<String, dynamic>))
            .toList(),
        nextMilestone: j['nextMilestone'] == null
            ? null
            : MilestoneTarget.fromJson(j['nextMilestone'] as Map<String, dynamic>),
      );
}

/// 里程里程碑证书（已达成的 100/500/1000/3000 km）。
class MilestoneCert {
  const MilestoneCert({required this.km, required this.title, required this.desc, this.currentKm});
  final int km;
  final String title;
  final String desc;
  final double? currentKm;
  factory MilestoneCert.fromJson(Map<String, dynamic> j) => MilestoneCert(
        km: (j['km'] as num?)?.toInt() ?? 0,
        title: (j['title'] as String?) ?? '',
        desc: (j['desc'] as String?) ?? '',
        currentKm: (j['currentKm'] as num?)?.toDouble(),
      );
}

/// 下一里程碑目标（未达成，用于进度展示）。
class MilestoneTarget {
  const MilestoneTarget({required this.km, required this.title, required this.desc});
  final int km;
  final String title;
  final String desc;
  factory MilestoneTarget.fromJson(Map<String, dynamic> j) => MilestoneTarget(
        km: (j['km'] as num?)?.toInt() ?? 0,
        title: (j['title'] as String?) ?? '',
        desc: (j['desc'] as String?) ?? '',
      );
}

/// 赛事证书（已报名马拉松）。
class MarathonCert {
  const MarathonCert({required this.title, required this.date, this.location, this.cover, this.status});
  final String title;
  final String date;
  final String? location;
  final String? cover;
  final String? status;
  factory MarathonCert.fromJson(Map<String, dynamic> j) => MarathonCert(
        title: (j['title'] as String?) ?? '',
        date: (j['date'] as String?) ?? '',
        location: j['location'] as String?,
        cover: j['cover'] as String?,
        status: j['status'] as String?,
      );
}
