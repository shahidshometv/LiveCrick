class PlaybackSession {
  const PlaybackSession({
    required this.sessionId,
    required this.manifestUrl,
    required this.expiresAt,
    required this.drmRequired,
  });

  final String sessionId;
  final String manifestUrl;
  final DateTime expiresAt;
  final bool drmRequired;

  factory PlaybackSession.fromJson(Map<String, dynamic> j) {
    final drm = j['drm'] as Map<String, dynamic>?;
    return PlaybackSession(
      sessionId: j['sessionId'] as String,
      manifestUrl: j['manifestUrl'] as String,
      expiresAt: DateTime.parse(j['expiresAt'] as String),
      drmRequired: (drm?['required'] as bool?) ?? false,
    );
  }
}
