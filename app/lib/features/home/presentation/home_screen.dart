import 'package:flutter/material.dart';

import '../../../core/data/livecrick_repository.dart';
import '../../cricket/presentation/match_list.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('LiveCrick · Live now')),
      body: const MatchList(status: MatchStatus.live),
    );
  }
}
