import 'package:geolocator/geolocator.dart';

/// GPS 定位结果。
class LocationResult {
  const LocationResult({required this.lat, required this.lon});
  final double lat;
  final double lon;
}

/// 定位服务（geolocator 封装）。
///
/// 处理：服务开关 → 权限检查/请求 → 取坐标（高精度 + 10s 超时）。
/// 失败抛中文友好异常，UI 层直接展示。
///
/// 批 3 用 geolocator（WGS-84，无 key）；批 4 切高德 amap（GCJ-02 + 地图）。
class LocationService {
  LocationService._();

  static Future<LocationResult> getCurrent() async {
    final serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      throw Exception('定位服务未开启，请在系统设置中开启 GPS');
    }

    var permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
    }
    if (permission == LocationPermission.denied) {
      throw Exception('定位权限被拒绝');
    }
    if (permission == LocationPermission.deniedForever) {
      throw Exception('定位权限被永久拒绝，请在系统设置「应用权限」中授予');
    }

    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 10),
      ),
    );
    return LocationResult(lat: pos.latitude, lon: pos.longitude);
  }
}
