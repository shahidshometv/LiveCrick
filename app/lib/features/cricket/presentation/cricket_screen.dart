import 'package:flutter/material.dart';

import '../../../core/data/livecrick_repository.dart';
import 'match_list.dart';

class CricketScreen extends StatelessWidget {
  const CricketScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('Cricket'),
          bottom: const TabBar(
            tabs: [
              Tab(text: 'Live'),
              Tab(text: 'Upcoming'),
              Tab(text: 'Results'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            MatchList(status: MatchStatus.live),
            MatchList(status: MatchStatus.upcoming),
            MatchList(status: MatchStatus.completed),
          ],
        ),
      ),
    );
  }
}
