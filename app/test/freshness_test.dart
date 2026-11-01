import 'package:flutter_test/flutter_test.dart';
import 'package:livecrick_app/features/cricket/presentation/freshness.dart';

void main() {
  final now = DateTime.utc(2026, 11, 1, 12, 0, 0);

  test('missing timestamp is reported as unavailable', () {
    expect(freshnessLabel(null, now: now), 'Score unavailable');
  });

  test('recent update is shown as just now', () {
    final updated = now.subtract(const Duration(seconds: 5));
    expect(freshnessLabel(updated, now: now), 'Updated just now');
  });

  test('old update is flagged as possibly stale', () {
    final updated = now.subtract(const Duration(minutes: 5));
    expect(freshnessLabel(updated, now: now), contains('may be stale'));
  });
}
