import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'models.dart';

/// 饮食远程数据源：myMeals（今日汇总）+ recordMeal（记录一餐）。
class FoodRemote {
  FoodRemote._();

  static Future<MealDay> myMeals() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.foodBase,
      ApiEndpoints.actionFoodMyMeals,
    );
    return MealDay.fromJson(data);
  }

  static Future<void> recordMeal({
    required String mealType,
    required List<MealItem> items,
  }) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.foodBase,
      ApiEndpoints.actionFoodRecordMeal,
      payload: {
        'mealType': mealType,
        'items': items.map((e) => e.toJson()).toList(),
      },
    );
  }
}
