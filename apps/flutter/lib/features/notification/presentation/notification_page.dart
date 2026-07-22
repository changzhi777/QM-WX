import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/design_system/app_card.dart';
import '../data/notification_models.dart';
import 'notification_controller.dart';

/// 消息通知：列表（类型 badge + actor + 未读红点）+ 点击已读 + 全部已读。
class NotificationPage extends ConsumerWidget {
  const NotificationPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(notificationProvider);
    final c = Theme.of(context).colorScheme;
    final hasUnread = async.valueOrNull?.any((n) => !n.isRead) ?? false;
    return Scaffold(
      appBar: AppBar(
        title: const Text('消息'),
        actions: [
          TextButton(
            onPressed: hasUnread
                ? () => ref.read(notificationProvider.notifier).markAllRead()
                : null,
            child: const Text('全部已读'),
          ),
        ],
      ),
      body: async.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('加载失败', style: TextStyle(color: c.error)),
              const SizedBox(height: 8),
              FilledButton(
                  onPressed: () =>
                      ref.read(notificationProvider.notifier).refresh(),
                  child: const Text('重试')),
            ],
          ),
        ),
        data: (list) => list.isEmpty
            ? ListView(padding: const EdgeInsets.all(16), children: [
                AppCard(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Center(
                        child:
                            Text('暂无消息', style: TextStyle(color: c.outline))),
                  ),
                ),
              ])
            : RefreshIndicator(
                onRefresh: () =>
                    ref.read(notificationProvider.notifier).refresh(),
                child: ListView(
                  padding: const EdgeInsets.all(16),
                  children: list
                      .map((n) => Padding(
                          padding: const EdgeInsets.only(bottom: 8),
                          child: _NotifTile(
                              n: n,
                              onTap: () => ref
                                  .read(notificationProvider.notifier)
                                  .markRead(n))))
                      .toList(),
                ),
              ),
      ),
    );
  }
}

class _NotifTile extends StatelessWidget {
  const _NotifTile({required this.n, required this.onTap});
  final AppNotification n;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    final c = Theme.of(context).colorScheme;
    return AppCard(
      child: ListTile(
        contentPadding: EdgeInsets.zero,
        leading: Stack(
          clipBehavior: Clip.none,
          children: [
            CircleAvatar(
              radius: 20,
              backgroundColor: c.primaryContainer,
              backgroundImage: (n.actor?.avatarUrl ?? '').isNotEmpty
                  ? NetworkImage(n.actor!.avatarUrl!)
                  : null,
              child: (n.actor?.avatarUrl ?? '').isEmpty
                  ? Icon(Icons.person, color: c.onPrimaryContainer)
                  : null,
            ),
            Positioned(
              right: -4,
              bottom: -4,
              child: Container(
                padding: const EdgeInsets.all(3),
                decoration: BoxDecoration(
                    color: c.surface, shape: BoxShape.circle),
                child: Icon(n.icon, size: 14, color: c.primary),
              ),
            ),
          ],
        ),
        title: RichText(
          text: TextSpan(
            style: tt.bodyMedium?.copyWith(color: c.onSurface),
            children: [
              TextSpan(
                  text: n.actor?.displayName ?? '系统',
                  style: const TextStyle(fontWeight: FontWeight.bold)),
              TextSpan(
                  text: '  ${n.label}', style: TextStyle(color: c.outline)),
            ],
          ),
        ),
        subtitle: (n.content ?? '').isNotEmpty
            ? Text(n.content!,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: tt.bodySmall)
            : null,
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (n.dateLabel.isNotEmpty)
              Text(n.dateLabel,
                  style: tt.bodySmall?.copyWith(color: c.outline)),
            if (!n.isRead) ...[
              const SizedBox(width: 8),
              Container(
                  width: 8,
                  height: 8,
                  decoration: const BoxDecoration(
                      color: Colors.red, shape: BoxShape.circle)),
            ],
          ],
        ),
        onTap: onTap,
      ),
    );
  }
}
