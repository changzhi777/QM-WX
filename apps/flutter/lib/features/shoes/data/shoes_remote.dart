import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'shoe_models.dart';

/// 跑鞋远程数据源：list / add。
class ShoesRemote {
  ShoesRemote._();

  static Future<List<Shoe>> list() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.shoesBase,
      ApiEndpoints.actionShoesList,
    );
    final arr = (data['shoes'] as List?) ?? const [];
    return arr
        .map((e) => Shoe.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  static Future<void> add(AddShoeRequest req) async {
    await ApiClient.instance.postAction(
      ApiEndpoints.shoesBase,
      ApiEndpoints.actionShoesAdd,
      payload: req.toJson(),
    );
  }
}
