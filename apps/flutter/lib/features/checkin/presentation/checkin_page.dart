import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/design_system/app_card.dart';
import '../../../core/location/location_service.dart';
import '../../today/presentation/today_controller.dart';
import '../data/checkin_models.dart';
import '../data/checkin_remote.dart';

/// 运动打卡页：距离/时长/运动类型 + GPS 定位（可选）→ 提交。
///
/// 批 3 MVP：distance + duration + sportType + location（lat/lon）。
/// 心率/步频/选鞋留后续（YAGNI）。提交成功 invalidate 今日页 + pop。
class CheckinPage extends ConsumerStatefulWidget {
  const CheckinPage({super.key});

  @override
  ConsumerState<CheckinPage> createState() => _CheckinPageState();
}

class _CheckinPageState extends ConsumerState<CheckinPage> {
  final _distanceCtrl = TextEditingController();
  final _durationCtrl = TextEditingController();
  String _sportType = 'run';
  LocationResult? _location;
  String? _locError;
  bool _locating = false;
  bool _submitting = false;
  String? _formError;

  static const _sports = <(String, String, IconData)>[
    ('run', '跑步', Icons.directions_run),
    ('ride', '骑行', Icons.directions_bike),
    ('walk', '步行', Icons.directions_walk),
    ('swim', '游泳', Icons.pool),
  ];

  @override
  void dispose() {
    _distanceCtrl.dispose();
    _durationCtrl.dispose();
    super.dispose();
  }

  Future<void> _locate() async {
    setState(() {
      _locating = true;
      _locError = null;
    });
    try {
      final loc = await LocationService.getCurrent();
      setState(() {
        _location = loc;
        _locating = false;
      });
    } catch (e) {
      setState(() {
        _locError = e.toString().replaceFirst('Exception: ', '');
        _locating = false;
      });
    }
  }

  Future<void> _submit() async {
    final dist = double.tryParse(_distanceCtrl.text.trim());
    final durMin = double.tryParse(_durationCtrl.text.trim());
    if (dist == null || dist < 0.5 || dist > 50) {
      setState(() => _formError = '距离需在 0.5 - 50 km 之间');
      return;
    }
    setState(() {
      _formError = null;
      _submitting = true;
    });
    try {
      final req = CheckinRequest(
        distance: dist,
        durationSec:
            (durMin != null && durMin > 0) ? (durMin * 60).round() : null,
        sportType: _sportType,
        lat: _location?.lat,
        lon: _location?.lon,
      );
      final result = await CheckinRemote.submit(req);
      // 刷新今日页（打卡后积分/统计变化）
      ref.invalidate(todayProvider);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('打卡成功！+${result.points} 积分')),
      );
      context.pop();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _formError = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final tt = Theme.of(context).textTheme;
    return Scaffold(
      appBar: AppBar(title: const Text('运动打卡')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AppCard(
              title: '运动信息',
              icon: Icons.directions_run,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(
                    controller: _distanceCtrl,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: '距离 (km)',
                      prefixText: 'km ',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 12),
                  TextField(
                    controller: _durationCtrl,
                    keyboardType:
                        const TextInputType.numberWithOptions(decimal: true),
                    decoration: const InputDecoration(
                      labelText: '时长 (分钟，选填)',
                      prefixText: 'min ',
                      border: OutlineInputBorder(),
                    ),
                  ),
                  const SizedBox(height: 16),
                  Text('运动类型', style: tt.bodySmall),
                  const SizedBox(height: 8),
                  Wrap(
                    spacing: 8,
                    children: _sports.map((s) {
                      final selected = _sportType == s.$1;
                      return ChoiceChip(
                        avatar: Icon(s.$3, size: 18),
                        label: Text(s.$2),
                        selected: selected,
                        onSelected: (_) => setState(() => _sportType = s.$1),
                      );
                    }).toList(),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            AppCard(
              title: '打卡位置',
              icon: Icons.location_on_outlined,
              child: Row(
                children: [
                  Expanded(child: Text(_locText(), style: tt.bodyMedium)),
                  const SizedBox(width: 8),
                  OutlinedButton.icon(
                    onPressed: _locating ? null : _locate,
                    icon: _locating
                        ? const SizedBox(
                            width: 16,
                            height: 16,
                            child: CircularProgressIndicator(strokeWidth: 2))
                        : const Icon(Icons.my_location),
                    label: Text(_location != null ? '重新定位' : '获取定位'),
                  ),
                ],
              ),
            ),
            if (_locError != null) ...[
              const SizedBox(height: 8),
              Text(_locError!, style: TextStyle(color: c.error, fontSize: 12)),
            ],
            if (_formError != null) ...[
              const SizedBox(height: 16),
              Text(_formError!, style: TextStyle(color: c.error, fontSize: 13)),
            ],
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: _submitting ? null : _submit,
              style: FilledButton.styleFrom(
                  padding: const EdgeInsets.symmetric(vertical: 14)),
              icon: _submitting
                  ? const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.check),
              label: Text(_submitting ? '提交中...' : '提交打卡'),
            ),
            const SizedBox(height: 8),
            Text('同日限 1 次计分 · 距离 0.5-50km（防作弊）',
                textAlign: TextAlign.center,
                style: tt.bodySmall?.copyWith(color: c.outline)),
          ],
        ),
      ),
    );
  }

  String _locText() {
    if (_location != null) {
      return '${_location!.lat.toStringAsFixed(4)}, ${_location!.lon.toStringAsFixed(4)}';
    }
    return '未获取（可选，用于天气快照）';
  }
}
