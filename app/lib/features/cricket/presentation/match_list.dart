import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/data/livecrick_repository.dart';
import '../../../core/providers.dart';
import '../../../shared/widgets/error_view.dart';
import 'match_card.dart';

class MatchList extends ConsumerWidget {
  const MatchList({super.key, required this.status});

  final MatchStatus status;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final matches = ref.watch(matchesProvider(status));

    return RefreshIndicator(
      onRefresh: () async {
        await ref.refresh(matchesProvider(status).future);
      },
      child: matches.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => ListView(
          children: [
            ErrorView(
              error: e,
              onRetry: () => ref.invalidate(matchesProvider(status)),
            ),
          ],
        ),
        data: (items) {
          if (items.isEmpty) {
            return ListView(
              children: const [
                Padding(
                  padding: EdgeInsets.all(32),
                  child: Center(child: Text('No matches right now.')),
                ),
              ],
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.symmetric(vertical: 8),
            itemCount: items.length,
            itemBuilder: (_, i) => MatchCard(match: items[i]),
          );
        },
      ),
    );
  }
}
