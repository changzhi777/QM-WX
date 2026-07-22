import 'package:flutter/material.dart';

import '../../core/legal/agreement_text.dart';

/// 用户服务协议展示页（华为模板，纯文本 SelectableText 可复制）。
class AgreementPage extends StatelessWidget {
  const AgreementPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('用户服务协议')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: SelectableText(
          kAgreementText,
          style: Theme.of(context).textTheme.bodyMedium,
        ),
      ),
    );
  }
}
