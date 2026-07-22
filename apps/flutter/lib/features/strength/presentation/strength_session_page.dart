import 'dart:async';

import 'package:flutter/material.dart';

import '../data/models.dart';
import '../data/remote.dart';

/// 力量训练流：开始 → 加组（实时累加 volume）→ 完成（自动计时）。
class StrengthSessionPage extends StatefulWidget {
  const StrengthSessionPage({super.key});
  @override
  State<StrengthSessionPage> createState() => _StrengthSessionPageState();
}

class _StrengthSessionPageState extends State<StrengthSessionPage> {
  String? _sessionId;
  DateTime? _startTime;
  final List<StrengthSet> _sets = [];
  final _exercise = TextEditingController();
  final _reps = TextEditingController();
  final _weight = TextEditingController();
  Timer? _timer;
  int _elapsed = 0;
  bool _busy = false;

  @override
  void dispose() {
    _exercise.dispose();
    _reps.dispose();
    _weight.dispose();
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _start() async {
    setState(() => _busy = true);
    try {
      final id = await StrengthRemote.startSession();
      setState(() {
        _sessionId = id;
        _startTime = DateTime.now();
        _elapsed = 0;
      });
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (_startTime != null && mounted) {
          setState(() => _elapsed = DateTime.now().difference(_startTime!).inSeconds);
        }
      });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  int _setIndexFor(String name) => _sets.where((s) => s.exerciseName == name).length + 1;

  Future<void> _addSet() async {
    final name = _exercise.text.trim();
    final reps = int.tryParse(_reps.text.trim());
    final weight = double.tryParse(_weight.text.trim());
    if (_sessionId == null || name.isEmpty || reps == null || weight == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('请填动作/次数/重量')));
      return;
    }
    setState(() => _busy = true);
    try {
      final idx = _setIndexFor(name);
      await StrengthRemote.addSet(
          sessionId: _sessionId!, exerciseName: name, reps: reps, weight: weight, setIndex: idx);
      setState(() {
        _sets.add(StrengthSet(exerciseName: name, reps: reps, weight: weight, setIndex: idx));
        _exercise.clear();
        _reps.clear();
        _weight.clear();
      });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _finish() async {
    if (_sessionId == null) return;
    setState(() => _busy = true);
    try {
      await StrengthRemote.finishSession(sessionId: _sessionId!, durationSec: _elapsed);
      _timer?.cancel();
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('训练已保存')));
        Navigator.of(context).pop(true);
      }
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.toString())));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  String get _timeLabel {
    final m = _elapsed ~/ 60;
    final s = _elapsed % 60;
    return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
  }

  double get _totalVolume => _sets.fold(0.0, (s, x) => s + x.volume);

  @override
  Widget build(BuildContext context) {
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: Text(_sessionId == null ? '开始训练' : '训练中 $_timeLabel')),
      body: _sessionId == null ? _idleView(tt) : _sessionView(tt),
    );
  }

  Widget _idleView(TextTheme tt) {
    final c = Theme.of(context).colorScheme;
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.fitness_center, size: 64, color: c.primary),
        const SizedBox(height: 16),
        Text('准备好了吗？', style: tt.titleLarge),
        const SizedBox(height: 24),
        FilledButton.icon(
            onPressed: _busy ? null : _start,
            icon: const Icon(Icons.play_arrow),
            label: const Text('开始训练')),
      ]),
    );
  }

  Widget _sessionView(TextTheme tt) {
    final c = Theme.of(context).colorScheme;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Row(children: [
        Expanded(child: _miniStat(c, tt, '${_sets.length}', '组数')),
        Expanded(child: _miniStat(c, tt, _totalVolume.toStringAsFixed(0), '容量 kg')),
      ]),
      const SizedBox(height: 16),
      TextField(
          controller: _exercise,
          decoration: const InputDecoration(labelText: '动作名称', border: OutlineInputBorder())),
      const SizedBox(height: 8),
      Row(children: [
        Expanded(
            child: TextField(
                controller: _reps,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: '次数', border: OutlineInputBorder()))),
        const SizedBox(width: 8),
        Expanded(
            child: TextField(
                controller: _weight,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: '重量 kg', border: OutlineInputBorder()))),
      ]),
      const SizedBox(height: 8),
      FilledButton.icon(
          onPressed: _busy ? null : _addSet, icon: const Icon(Icons.add), label: const Text('加组')),
      const SizedBox(height: 16),
      Text('已记录 ${_sets.length} 组', style: tt.titleSmall?.copyWith(fontWeight: FontWeight.bold)),
      const SizedBox(height: 8),
      ..._sets.asMap().entries.map((e) => ListTile(
            leading: CircleAvatar(child: Text('${e.key + 1}')),
            title: Text(e.value.exerciseName),
            subtitle: Text(
                '${e.value.reps} 次 × ${e.value.weight} kg = ${e.value.volume.toStringAsFixed(0)} kg'),
          )),
      const SizedBox(height: 16),
      FilledButton.icon(
          onPressed: _busy ? null : _finish, icon: const Icon(Icons.check), label: const Text('完成训练')),
    ]);
  }

  Widget _miniStat(ColorScheme c, TextTheme tt, String value, String label) => Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
            color: c.surfaceContainerHighest, borderRadius: BorderRadius.circular(16)),
        child: Column(children: [
          Text(value, style: tt.titleLarge?.copyWith(fontWeight: FontWeight.bold, color: c.primary)),
          Text(label, style: tt.bodySmall?.copyWith(color: c.outline)),
        ]),
      );
}
