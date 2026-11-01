class Channel {
  const Channel({
    required this.id,
    required this.name,
    required this.language,
    required this.category,
    this.logoUrl,
  });

  final String id;
  final String name;
  final String language;
  final String category;
  final String? logoUrl;

  factory Channel.fromJson(Map<String, dynamic> j) => Channel(
        id: j['id'] as String,
        name: j['name'] as String,
        language: (j['language'] as String?) ?? '',
        category: (j['category'] as String?) ?? '',
        logoUrl: j['logoUrl'] as String?,
      );
}
