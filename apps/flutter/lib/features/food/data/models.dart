/// 食物项（饮食记录/识别结果）。
class MealItem {
  const MealItem({required this.name, required this.calorie, this.protein, this.fat, this.carb, this.foodId});
  final String name;
  final double calorie;
  final double? protein;
  final double? fat;
  final double? carb;
  final String? foodId;

  Map<String, dynamic> toJson() => {
        'name': name,
        'calorie': calorie,
        if (protein != null) 'protein': protein,
        if (fat != null) 'fat': fat,
        if (carb != null) 'carb': carb,
        if (foodId != null) 'foodId': foodId,
      };

  factory MealItem.fromJson(Map<String, dynamic> j) => MealItem(
        name: (j['name'] as String?) ?? '',
        calorie: (j['calorie'] as num?)?.toDouble() ?? 0,
        protein: (j['protein'] as num?)?.toDouble(),
        fat: (j['fat'] as num?)?.toDouble(),
        carb: (j['carb'] as num?)?.toDouble(),
        foodId: j['foodId'] as String?,
      );
}

/// 一餐记录（myMeals.meals 项）。
class MealRecord {
  const MealRecord({required this.id, required this.mealType, required this.items, required this.totalCalorie, required this.createdAt});
  final String id;
  final String mealType;
  final List<MealItem> items;
  final double totalCalorie;
  final String createdAt;

  factory MealRecord.fromJson(Map<String, dynamic> j) => MealRecord(
        id: (j['id'] as String?) ?? '',
        mealType: (j['mealType'] as String?) ?? '',
        items: ((j['items'] as List?) ?? const [])
            .map((e) => MealItem.fromJson(e as Map<String, dynamic>))
            .toList(),
        totalCalorie: (j['totalCalorie'] as num?)?.toDouble() ?? 0,
        createdAt: (j['createdAt'] as String?) ?? '',
      );
}

/// 一日宏量汇总（myMeals.summary）。
class MealSummary {
  const MealSummary({required this.calorie, required this.protein, required this.fat, required this.carb});
  final double calorie;
  final double protein;
  final double fat;
  final double carb;

  factory MealSummary.fromJson(Map<String, dynamic> j) => MealSummary(
        calorie: (j['calorie'] as num?)?.toDouble() ?? 0,
        protein: (j['protein'] as num?)?.toDouble() ?? 0,
        fat: (j['fat'] as num?)?.toDouble() ?? 0,
        carb: (j['carb'] as num?)?.toDouble() ?? 0,
      );
}

/// 一日饮食（myMeals 返回）。
class MealDay {
  const MealDay({required this.date, required this.meals, required this.summary});
  final String date;
  final List<MealRecord> meals;
  final MealSummary summary;

  factory MealDay.fromJson(Map<String, dynamic> j) => MealDay(
        date: (j['date'] as String?) ?? '',
        meals: ((j['meals'] as List?) ?? const [])
            .map((e) => MealRecord.fromJson(e as Map<String, dynamic>))
            .toList(),
        summary: MealSummary.fromJson((j['summary'] as Map<String, dynamic>?) ?? const {}),
      );
}

/// 餐次中文标签。
String mealTypeLabel(String t) =>
    const {'breakfast': '早餐', 'lunch': '午餐', 'dinner': '晚餐', 'snack': '加餐'}[t] ?? t;
