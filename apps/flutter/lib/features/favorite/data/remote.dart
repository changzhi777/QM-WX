import '../../../core/network/api_client.dart';
import '../../../core/network/api_endpoints.dart';
import 'models.dart';

/// 收藏远程数据源：list（我的收藏列表）。
class FavoriteRemote {
  FavoriteRemote._();

  static Future<List<FavoriteItem>> list() async {
    final data = await ApiClient.instance.postAction(
      ApiEndpoints.favoriteBase,
      ApiEndpoints.actionFavoriteList,
    );
    final favs = (data['favorites'] as List?) ?? const [];
    return favs.map((e) => FavoriteItem.fromJson(e as Map<String, dynamic>)).toList();
  }
}
