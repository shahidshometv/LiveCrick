class Env {
  Env._();

  /// Base URL of the LiveCrick API (PRD section 12, base path /api/v1).
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api/v1',
  );

  /// When true, the app reads bundled JSON fixtures instead of calling the API.
  static const useMockData = bool.fromEnvironment(
    'USE_MOCK',
    defaultValue: true,
  );
}
