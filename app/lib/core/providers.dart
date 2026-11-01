import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../features/cricket/domain/cricket_match.dart';
import '../features/live_tv/domain/channel.dart';
import 'config/env.dart';
import 'data/livecrick_repository.dart';
import 'data/mock_repository.dart';
import 'data/remote_repository.dart';
import 'network/api_client.dart';

final repositoryProvider = Provider<LiveCrickRepository>((ref) {
  if (Env.useMockData) return MockRepository();
  return RemoteRepository(ApiClient());
});

final matchesProvider =
    FutureProvider.family<List<CricketMatch>, MatchStatus>((ref, status) {
  return ref.watch(repositoryProvider).fetchMatches(status);
});

final channelsProvider =
    FutureProvider.family<List<Channel>, String>((ref, search) {
  return ref
      .watch(repositoryProvider)
      .fetchChannels(search: search.isEmpty ? null : search);
});
