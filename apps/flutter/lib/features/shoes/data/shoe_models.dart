// 跑鞋模型（与后端 shoes.list / shoes.add 对齐）。

class Shoe {
  const Shoe({
    required this.id,
    required this.brand,
    required this.model,
    this.nickname,
    this.currentKm = 0,
    this.thresholdKm = 800,
    this.status = 'active',
    this.purchasedAt,
    this.note,
    this.healthRatio,
  });

  final String id;
  final String brand;
  final String model;
  final String? nickname;
  final double currentKm;
  final double thresholdKm;
  final String status; // active / retired
  final String? purchasedAt;
  final String? note;
  final double? healthRatio; // currentKm/thresholdKm*100

  factory Shoe.fromJson(Map<String, dynamic> j) => Shoe(
        id: j['id'] as String,
        brand: (j['brand'] as String?) ?? '',
        model: (j['model'] as String?) ?? '',
        nickname: j['nickname'] as String?,
        currentKm: (j['currentKm'] as num?)?.toDouble() ?? 0,
        thresholdKm: (j['thresholdKm'] as num?)?.toDouble() ?? 800,
        status: (j['status'] as String?) ?? 'active',
        purchasedAt: j['purchasedAt'] as String?,
        note: j['note'] as String?,
        healthRatio: (j['healthRatio'] as num?)?.toDouble(),
      );

  bool get isRetired => status == 'retired';

  /// 展示名：昵称优先，回退 品牌型号
  String get displayName =>
      (nickname ?? '').isNotEmpty ? nickname! : '$brand $model';

  /// 进度比例（0-1+，用于进度条）
  double get progress => thresholdKm > 0 ? currentKm / thresholdKm : 0;
}

class AddShoeRequest {
  const AddShoeRequest({
    required this.brand,
    required this.model,
    this.nickname,
    this.thresholdKm = 800,
    this.purchasedAt,
    this.note,
  });

  final String brand;
  final String model;
  final String? nickname;
  final double thresholdKm;
  final String? purchasedAt; // ISO datetime
  final String? note;

  Map<String, dynamic> toJson() {
    final m = <String, dynamic>{
      'brand': brand,
      'model': model,
      'thresholdKm': thresholdKm,
    };
    final n = nickname;
    if (n != null && n.isNotEmpty) m['nickname'] = n;
    final p = purchasedAt;
    if (p != null && p.isNotEmpty) m['purchasedAt'] = p;
    final no = note;
    if (no != null && no.isNotEmpty) m['note'] = no;
    return m;
  }
}

/// 跑鞋详情（getDetail，复用 Shoe 字段 + 统计）
class ShoeDetail {
  const ShoeDetail({
    required this.id,
    required this.brand,
    required this.model,
    this.nickname,
    this.currentKm = 0,
    this.thresholdKm = 800,
    this.status = 'active',
    this.purchasedAt,
    this.note,
    this.healthRatio,
    this.totalCheckins = 0,
    this.daysSincePurchase,
    this.latestCheckinAt,
  });

  final String id;
  final String brand;
  final String model;
  final String? nickname;
  final double currentKm;
  final double thresholdKm;
  final String status;
  final String? purchasedAt;
  final String? note;
  final double? healthRatio;
  final int totalCheckins;
  final int? daysSincePurchase;
  final String? latestCheckinAt;

  factory ShoeDetail.fromJson(Map<String, dynamic> j) => ShoeDetail(
        id: (j['id'] as String?) ?? '',
        brand: (j['brand'] as String?) ?? '',
        model: (j['model'] as String?) ?? '',
        nickname: j['nickname'] as String?,
        currentKm: (j['currentKm'] as num?)?.toDouble() ?? 0,
        thresholdKm: (j['thresholdKm'] as num?)?.toDouble() ?? 800,
        status: (j['status'] as String?) ?? 'active',
        purchasedAt: j['purchasedAt'] as String?,
        note: j['note'] as String?,
        healthRatio: (j['healthRatio'] as num?)?.toDouble(),
        totalCheckins: (j['totalCheckins'] as num?)?.toInt() ?? 0,
        daysSincePurchase: (j['daysSincePurchase'] as num?)?.toInt(),
        latestCheckinAt: j['latestCheckinAt'] as String?,
      );

  String get displayName => (nickname ?? '').isNotEmpty ? nickname! : '$brand $model';
  bool get isRetired => status == 'retired';
  double get progress => thresholdKm > 0 ? currentKm / thresholdKm : 0.0;
}

/// 里程曲线点（getMileageHistory weekly/monthly）
class MileagePoint {
  const MileagePoint({this.date = '', this.km = 0});
  final String date;
  final double km;
  factory MileagePoint.fromJson(Map<String, dynamic> j) => MileagePoint(
        date: (j['date'] as String?) ?? '',
        km: (j['km'] as num?)?.toDouble() ?? (j['distance'] as num?)?.toDouble() ?? 0,
      );
}

class MileageHistory {
  const MileageHistory({this.weekly = const [], this.monthly = const [], this.totalKm = 0});
  final List<MileagePoint> weekly;
  final List<MileagePoint> monthly;
  final double totalKm;

  factory MileageHistory.fromJson(Map<String, dynamic> j) {
    List<MileagePoint> parse(String key) => ((j[key] as List?) ?? const [])
        .map((e) => MileagePoint.fromJson(e as Map<String, dynamic>))
        .toList();
    return MileageHistory(
      weekly: parse('weekly'),
      monthly: parse('monthly'),
      totalKm: (j['totalKm'] as num?)?.toDouble() ?? 0,
    );
  }
}
