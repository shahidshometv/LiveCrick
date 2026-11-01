import '../../features/cricket/domain/cricket_match.dart';
import '../../features/live_tv/domain/channel.dart';
import '../../features/player/domain/playback_session.dart';

enum MatchStatus { live, upcoming, completed }

extension MatchStatusX on MatchStatus {
  String get apiValue => name;
}

/// The app depends only on this interface. Swap implementations with one flag.
abstract class LiveCrickRepository {
  Future<List<CricketMatch>> fetchMatches(MatchStatus status);

  Future<List<Channel>> fetchChannels({String? search});

  Future<PlaybackSession> authorizePlayback({required String channelId});
}
