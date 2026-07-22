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
