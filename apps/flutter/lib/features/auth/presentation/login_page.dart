import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'auth_controller.dart';

/// 登录页（账号密码）。
///
/// Phase 1 批 1：R1 账号密码先（后端 V0.1.129 已有）；
/// Phase 1.5 加手机号 + 微信登录入口（待短信服务 + 微信开放平台 APP）。
class LoginPage extends ConsumerStatefulWidget {
  const LoginPage({super.key});

  @override
  ConsumerState<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends ConsumerState<LoginPage> {
  final _u = TextEditingController();
  final _p = TextEditingController();
  bool _obscure = true;
  bool _submitted = false;

  @override
  void dispose() {
    _u.dispose();
    _p.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() => _submitted = true);
    final u = _u.text.trim();
    final p = _p.text;
    if (u.isEmpty || p.isEmpty) return; // 表单校验提示在 TextField errorText

    await ref.read(authProvider.notifier).loginWithPassword(u, p);
    if (!mounted) return;
    final av = ref.read(authProvider);
    if (av.hasError) {
      _toast(_errMsg(av.error));
    }
    // 登录成功 → router 守卫自动跳主壳
  }

  String _errMsg(Object? e) {
    final s = e.toString();
    // 剥掉 ApiException(...) 前缀，给用户看人话
    final i = s.indexOf(': ');
    return i > 0 ? s.substring(i + 2) : s;
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    final loading = ref.watch(authProvider).isLoading;

    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Icon(Icons.favorite_rounded, size: 64, color: c.primary),
                const SizedBox(height: 12),
                Text('沐禾健康',
                    textAlign: TextAlign.center,
                    style: tt.headlineSmall
                        ?.copyWith(color: c.primary, fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text('登录开启你的健康旅程',
                    textAlign: TextAlign.center,
                    style: tt.bodyMedium?.copyWith(color: c.outline)),
                const SizedBox(height: 32),
                TextField(
                  controller: _u,
                  decoration: InputDecoration(
                    labelText: '用户名',
                    prefixIcon: const Icon(Icons.person_outline),
                    border: const OutlineInputBorder(),
                    errorText: _submitted && _u.text.trim().isEmpty ? '请输入用户名' : null,
                  ),
                  textInputAction: TextInputAction.next,
                  onChanged: (_) => _submitted ? setState(() => _submitted = false) : null,
                ),
                const SizedBox(height: 16),
                TextField(
                  controller: _p,
                  obscureText: _obscure,
                  decoration: InputDecoration(
                    labelText: '密码',
                    prefixIcon: const Icon(Icons.lock_outline),
                    border: const OutlineInputBorder(),
                    errorText: _submitted && _p.text.isEmpty ? '请输入密码' : null,
                    suffixIcon: IconButton(
                      icon: Icon(_obscure
                          ? Icons.visibility_off_outlined
                          : Icons.visibility_outlined),
                      onPressed: () => setState(() => _obscure = !_obscure),
                    ),
                  ),
                  onSubmitted: (_) => _submit(),
                  onChanged: (_) => _submitted ? setState(() => _submitted = false) : null,
                ),
                const SizedBox(height: 24),
                FilledButton.icon(
                  onPressed: loading ? null : _submit,
                  style: FilledButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 14),
                  ),
                  icon: loading
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : const Icon(Icons.login),
                  label: Text(loading ? '登录中...' : '登录'),
                ),
                const SizedBox(height: 16),
                Text(
                  '账号需在小程序端「绑定账号」后生成',
                  textAlign: TextAlign.center,
                  style: tt.bodySmall?.copyWith(color: c.outline),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
