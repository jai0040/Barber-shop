export interface ApiSuccess<T> { success: true; data: T }
export interface ApiError { success: false; message: string; code: string; details?: unknown }
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface Paginated<T> { items: T[]; page: number; limit: number; total: number }

export const ErrorCodes = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  CSRF_FAILED: 'CSRF_FAILED',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_FILE: 'UNSUPPORTED_FILE',
  INTERNAL: 'INTERNAL_ERROR',
} as const;
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
