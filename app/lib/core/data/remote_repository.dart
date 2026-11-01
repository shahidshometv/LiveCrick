import '../../features/cricket/domain/cricket_match.dart';
import '../../features/live_tv/domain/channel.dart';
import '../../features/player/domain/playback_session.dart';
import '../network/api_client.dart';
import 'livecrick_repository.dart';

class RemoteRepository implements LiveCrickRepository {
  RemoteRepository(this._api);

  final ApiClient _api;

  @override
  Future<List<CricketMatch>> fetchMatches(MatchStatus status) {
    return _api.get<List<CricketMatch>>(
      '/cricket/matches',
      (data) => (data as List)
          .map((e) => CricketMatch.fromJson(e as Map<String, dynamic>))
          .toList(),
      query: {'status': status.apiValue},
    );
  }

  @override
  Future<List<Channel>> fetchChannels({String? search}) {
    return _api.get<List<Channel>>(
      '/channels',
      (data) => (data as List)
          .map((e) => Channel.fromJson(e as Map<String, dynamic>))
          .toList(),
      query: {if (search != null && search.isNotEmpty) 'search': search},
    );
  }

  @override
  Future<PlaybackSession> authorizePlayback({required String channelId}) {
    return _api.post<PlaybackSession>(
      '/playback/authorize',
      (data) => PlaybackSession.fromJson(data as Map<String, dynamic>),
      body: {
        'channelId': channelId,
        'platform': 'android',
        'appVersion': '1.0.0',
      },
    );
  }
}
