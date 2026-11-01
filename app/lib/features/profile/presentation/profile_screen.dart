import 'package:flutter/material.dart';

import '../../../core/config/env.dart';

class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: ListView(
        children: [
          const ListTile(
            leading: CircleAvatar(child: Icon(Icons.person)),
            title: Text('Guest'),
            subtitle: Text('Sign in is optional'),
          ),
          const Divider(),
          const ListTile(title: Text('Notification settings')),
          const ListTile(title: Text('Privacy policy')),
          const ListTile(title: Text('Terms of use')),
          const ListTile(title: Text('Help and support')),
          const Divider(),
          ListTile(
            title: const Text('Data source'),
            subtitle: Text(Env.useMockData ? 'Mock data' : Env.apiBaseUrl),
          ),
        ],
      ),
    );
  }
}
