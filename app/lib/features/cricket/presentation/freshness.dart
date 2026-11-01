/// Human-readable freshness for live scores (PRD section 13: never present
/// stale data as live).
String freshnessLabel(DateTime? updatedAt, {DateTime? now}) {
  if (updatedAt == null) return 'Score unavailable';

  final age = (now ?? DateTime.now().toUtc()).difference(updatedAt.toUtc());
  if (age.isNegative || age.inSeconds < 30) return 'Updated just now';
  if (age.inMinutes < 2) return 'Updated ${age.inSeconds}s ago';
  return 'Last updated ${age.inMinutes} min ago · may be stale';
}
