import 'package:flutter/material.dart';

import '../domain/cricket_match.dart';
import 'freshness.dart';

class MatchCard extends StatelessWidget {
  const MatchCard({super.key, required this.match});

  final CricketMatch match;

  bool get _isLive => match.status == 'live';

  String _startLabel(DateTime? t) {
    if (t == null) return '';
    final local = t.toLocal();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${two(local.day)}/${two(local.month)} '
        '${two(local.hour)}:${two(local.minute)}';
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Card(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    match.tournament,
                    style: theme.textTheme.labelMedium,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (match.videoAvailable)
                  const Chip(
                    label: Text('Live video'),
                    visualDensity: VisualDensity.compact,
                  ),
              ],
            ),
            const SizedBox(height: 8),
            Text(
              '${match.teamAShort}  vs  ${match.teamBShort}',
              style: theme.textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            if (_isLive) ...[
              Text(
                match.scoreText ?? 'Score not available',
                style: theme.textTheme.bodyLarge,
              ),
              const SizedBox(height: 2),
              Text(
                freshnessLabel(match.lastUpdatedAt),
                style: theme.textTheme.bodySmall,
              ),
            ] else if (match.status == 'upcoming') ...[
              Text(
                'Starts ${_startLabel(match.startsAt)}',
                style: theme.textTheme.bodyMedium,
              ),
            ] else ...[
              Text(
                match.scoreText ?? 'Result unavailable',
                style: theme.textTheme.bodyMedium,
              ),
              const SizedBox(height: 2),
              Text('Final', style: theme.textTheme.bodySmall),
            ],
          ],
        ),
      ),
    );
  }
}
