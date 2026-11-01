import 'package:dio/dio.dart';

import '../config/env.dart';
import '../errors/api_exception.dart';

/// Thin wrapper over Dio that unwraps the PRD response envelope:
/// { "success": true, "data": ... } or { "success": false, "error": {...} }
class ApiClient {
  ApiClient({Dio? dio})
      : _dio = dio ??
            Dio(BaseOptions(
              baseUrl: Env.apiBaseUrl,
              connectTimeout: const Duration(seconds: 10),
              receiveTimeout: const Duration(seconds: 15),
              headers: {'Accept': 'application/json'},
            ));

  final Dio _dio;

  Future<T> get<T>(
    String path,
    T Function(Object? data) parse, {
    Map<String, dynamic>? query,
  }) {
    return _send(
      () => _dio.get<Map<String, dynamic>>(path, queryParameters: query),
      parse,
    );
  }

  Future<T> post<T>(
    String path,
    T Function(Object? data) parse, {
    Object? body,
  }) {
    return _send(
      () => _dio.post<Map<String, dynamic>>(path, data: body),
      parse,
    );
  }

  Future<T> _send<T>(
    Future<Response<Map<String, dynamic>>> Function() request,
    T Function(Object? data) parse,
  ) async {
    try {
      final response = await request();
      final body = response.data ?? const <String, dynamic>{};
      if (body['success'] == true) {
        return parse(body['data']);
      }
      throw _fromEnvelope(body);
    } on DioException catch (e) {
      final body = e.response?.data;
      if (body is Map<String, dynamic> && body['error'] is Map) {
        throw _fromEnvelope(body);
      }
      throw const ApiException(
        'NETWORK_ERROR',
        'Check your connection and try again.',
      );
    }
  }

  ApiException _fromEnvelope(Map<String, dynamic> body) {
    final error = (body['error'] as Map?) ?? const {};
    return ApiException(
      (error['code'] as String?) ?? 'UNKNOWN',
      (error['message'] as String?) ?? 'Something went wrong.',
    );
  }
}
