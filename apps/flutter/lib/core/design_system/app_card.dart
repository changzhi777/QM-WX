import 'package:flutter/material.dart';

/// 通用卡片（design_system 首个组件）。
///
/// 圆角 16 + 轻底色 + 可选标题行（icon + title + trailing）+ 内容 slot。
/// 批 2 起所有卡片统一用此组件，保证视觉一致（DRY）。
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    this.title,
    this.icon,
    this.trailing,
    required this.child,
    this.padding,
  });

  final String? title;
  final IconData? icon;
  final Widget? trailing;
  final Widget child;
  final EdgeInsets? padding;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;

    // 标题行 children 显式构造（避免 collection-if-spread lint）
    final titleRowChildren = <Widget>[];
    if (icon != null) {
      titleRowChildren.add(Icon(icon, size: 20, color: c.primary));
      titleRowChildren.add(const SizedBox(width: 6));
    }
    if (title != null) {
      titleRowChildren.add(
        Expanded(
          child: Text(
            title!,
            style: tt.titleSmall?.copyWith(fontWeight: FontWeight.bold),
          ),
        ),
      );
    }
    if (trailing != null) {
      titleRowChildren.add(trailing!);
    }

    return Card(
      elevation: 0,
      color: c.surfaceContainerLow,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      child: Padding(
        padding: padding ?? const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (titleRowChildren.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 10),
                child: Row(children: titleRowChildren),
              ),
            child,
          ],
        ),
      ),
    );
  }
}
