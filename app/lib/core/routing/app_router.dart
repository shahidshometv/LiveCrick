import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../features/cricket/presentation/cricket_screen.dart';
import '../../features/home/presentation/home_screen.dart';
import '../../features/live_tv/presentation/live_tv_screen.dart';
import '../../features/player/presentation/player_screen.dart';
import '../../features/profile/presentation/profile_screen.dart';
import 'app_shell.dart';

final routerProvider = Provider<GoRouter>((ref) {
  return GoRouter(
    initialLocation: '/',
    routes: [
      ShellRoute(
        builder: (context, state, child) => AppShell(child: child),
        routes: [
          GoRoute(path: '/', builder: (_, __) => const HomeScreen()),
          GoRoute(path: '/cricket', builder: (_, __) => const CricketScreen()),
          GoRoute(path: '/live-tv', builder: (_, __) => const LiveTvScreen()),
          GoRoute(path: '/profile', builder: (_, __) => const ProfileScreen()),
        ],
      ),
      // Full-screen player sits outside the shell so the nav bar is hidden.
      GoRoute(
        path: '/player/:channelId',
        builder: (_, state) => PlayerScreen(
          channelId: state.pathParameters['channelId']!,
        ),
      ),
    ],
  );
});
