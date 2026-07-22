import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/shoe_models.dart';
import '../data/shoes_remote.dart';

/// 跑鞋列表控制器：加载 + 添加后刷新。
class ShoesController extends AsyncNotifier<List<Shoe>> {
  @override
  Future<List<Shoe>> build() => ShoesRemote.list();

  Future<void> add(AddShoeRequest req) async {
    await ShoesRemote.add(req);
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(ShoesRemote.list);
  }

  Future<void> refresh() async {
    state = const AsyncValue.loading();
    state = await AsyncValue.guard(ShoesRemote.list);
  }
}

final shoesProvider =
    AsyncNotifierProvider<ShoesController, List<Shoe>>(ShoesController.new);
