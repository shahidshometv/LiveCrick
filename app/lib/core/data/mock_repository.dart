import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import '../../features/cricket/domain/cricket_match.dart';
import '../../features/live_tv/domain/channel.dart';
import '../../features/player/domain/playback_session.dart';
import '../errors/api_exception.dart';
import 'livecrick_repository.dart';

/// Serves bundled fixtures so the UI works with no backend.
/// Playback only succeeds for channels whose fixture contains a
/// `testManifestUrl`, mirroring the fail-closed rule in PRD section 5.2.
class MockRepository implements LiveCrickRepository {
  Future<List<Map<String, dynamic>>> _load(String asset, String key) async {
    final raw = await rootBundle.loadString(asset);
    final list = (jsonDecode(raw) as Map<String, dynamic>)[key] as List;
    return list.cast<Map<String, dynamic>>();
  }

  @override
  Future<List<CricketMatch>> fetchMatches(MatchStatus status) async {
    final rows = await _load('assets/mock/matches.json', 'matches');
    return rows
        .map(CricketMatch.fromJson)
        .where((m) => m.status == status.apiValue)
        .toList();
  }

  @override
  Future<List<Channel>> fetchChannels({String? search}) async {
    final rows = await _load('assets/mock/channels.json', 'channels');
    final query = search?.toLowerCase() ?? '';
    return rows
        .map(Channel.fromJson)
        .where((c) => query.isEmpty || c.name.toLowerCase().contains(query))
        .toList();
  }

  @override
  Future<PlaybackSession> authorizePlayback({required String channelId}) async {
    final rows = await _load('assets/mock/channels.json', 'channels');
    final matches = rows.where((c) => c['id'] == channelId).toList();
    final testUrl =
        matches.isEmpty ? null : matches.first['testManifestUrl'] as String?;

    if (testUrl == null) {
      throw const ApiException(
        'CONTENT_NOT_AVAILABLE',
        'This content is not available in your region.',
      );
    }

    return PlaybackSession(
      sessionId: 'mock-$channelId',
      manifestUrl: testUrl,
      expiresAt: DateTime.now().toUtc().add(const Duration(minutes: 5)),
      drmRequired: false,
    );
  }
}
