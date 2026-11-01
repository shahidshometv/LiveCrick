import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:video_player/video_player.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/providers.dart';

class PlayerScreen extends ConsumerStatefulWidget {
  const PlayerScreen({super.key, required this.channelId});

  final String channelId;

  @override
  ConsumerState<PlayerScreen> createState() => _PlayerScreenState();
}

class _PlayerScreenState extends ConsumerState<PlayerScreen>
    with WidgetsBindingObserver {
  VideoPlayerController? _controller;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _start();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller?.dispose();
    super.dispose();
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Stop playback when the app leaves the foreground (PRD section 7.8).
    if (state != AppLifecycleState.resumed) {
      _controller?.pause();
    }
  }

  Future<void> _start() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final session = await ref
          .read(repositoryProvider)
          .authorizePlayback(channelId: widget.channelId);

      if (session.drmRequired) {
        throw const ApiException(
          'DRM_UNSUPPORTED',
          'This channel needs DRM, which this build does not support yet.',
        );
      }
      if (session.expiresAt.isBefore(DateTime.now().toUtc())) {
        throw const ApiException(
          'TOKEN_EXPIRED',
          'Playback session expired. Please try again.',
        );
      }

      final controller =
          VideoPlayerController.networkUrl(Uri.parse(session.manifestUrl));
      await controller.initialize();
      await controller.play();

      if (!mounted) {
        controller.dispose();
        return;
      }
      setState(() {
        _controller = controller;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (_) {
      if (!mounted) return;
      setState(() {
        _error = 'Playback failed. Check your connection and try again.';
        _loading = false;
      });
    }
  }

  void _togglePlayback() {
    final c = _controller;
    if (c == null) return;
    setState(() {
      if (c.value.isPlaying) {
        c.pause();
      } else {
        c.play();
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: const Text('Live'),
      ),
      body: Center(
        child: _loading
            ? const CircularProgressIndicator()
            : _error != null
                ? Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _error!,
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: Colors.white),
                        ),
                        const SizedBox(height: 12),
                        FilledButton(
                          onPressed: _start,
                          child: const Text('Retry'),
                        ),
                      ],
                    ),
                  )
                : AspectRatio(
                    aspectRatio: _controller!.value.aspectRatio,
                    child: GestureDetector(
                      onTap: _togglePlayback,
                      child: VideoPlayer(_controller!),
                    ),
                  ),
      ),
    );
  }
}
