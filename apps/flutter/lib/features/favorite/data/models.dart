/// 收藏项（favorite.list 返回）。
///
/// targetType: 'content'（赛事）/ 'product'（商品）；detail 为目标详情，null 表示已删除。
class FavoriteItem {
  const FavoriteItem({required this.id, required this.targetType, required this.targetId, required this.createdAt, this.detail});
  final String id;
  final String targetType;
  final String targetId;
  final String createdAt;
  final Map<String, dynamic>? detail;

  factory FavoriteItem.fromJson(Map<String, dynamic> j) => FavoriteItem(
        id: (j['id'] as String?) ?? '',
        targetType: (j['targetType'] as String?) ?? '',
        targetId: (j['targetId'] as String?) ?? '',
        createdAt: (j['createdAt'] as String?) ?? '',
        detail: j['detail'] as Map<String, dynamic>?,
      );

  String get title {
    if (detail == null) return '内容已删除';
    if (targetType == 'content') return (detail!['title'] as String?) ?? '内容已删除';
    return (detail!['name'] as String?) ?? '商品已删除';
  }

  String? get cover {
    if (detail == null) return null;
    if (targetType == 'content') return detail!['cover'] as String?;
    final imgs = detail!['images'] as List?;
    return (imgs == null || imgs.isEmpty) ? null : imgs.first as String?;
  }

  String get typeLabel => targetType == 'content' ? '赛事' : '商品';
  bool get deleted => detail == null;
}
