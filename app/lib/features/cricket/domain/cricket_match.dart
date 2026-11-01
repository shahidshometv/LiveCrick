class CricketMatch {
  const CricketMatch({
    required this.id,
    required this.status,
    required this.tournament,
    required this.teamAName,
    required this.teamAShort,
    required this.teamBName,
    required this.teamBShort,
    required this.videoAvailable,
    this.scoreText,
    this.lastUpdatedAt,
    this.startsAt,
  });

  final String id;
  final String status;
  final String tournament;
  final String teamAName;
  final String teamAShort;
  final String teamBName;
  final String teamBShort;
  final bool videoAvailable;
  final String? scoreText;
  final DateTime? lastUpdatedAt;
  final DateTime? startsAt;

  factory CricketMatch.fromJson(Map<String, dynamic> j) {
    final teamA = j['teamA'] as Map<String, dynamic>;
    final teamB = j['teamB'] as Map<String, dynamic>;
    final score = j['score'] as Map<String, dynamic>?;
    final video = j['video'] as Map<String, dynamic>?;

    return CricketMatch(
      id: j['id'] as String,
      status: j['status'] as String,
      tournament: (j['tournament'] as String?) ?? '',
      teamAName: teamA['name'] as String,
      teamAShort: teamA['shortName'] as String,
      teamBName: teamB['name'] as String,
      teamBShort: teamB['shortName'] as String,
      videoAvailable: (video?['available'] as bool?) ?? false,
      scoreText: score == null
          ? null
          : '${score['runs']}/${score['wickets']} (${score['overs']} ov)',
      lastUpdatedAt: _parse(j['lastUpdatedAt']),
      startsAt: _parse(j['startsAt']),
    );
  }

  static DateTime? _parse(Object? value) =>
      value == null ? null : DateTime.parse(value as String);
}
