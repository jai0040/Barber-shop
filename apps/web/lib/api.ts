import { ApiResponse, formatINR } from '@barbershop/shared';

export { formatINR };

const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const csrfToken = typeof window !== 'undefined' ? localStorage.getItem('csrfToken') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (options.body instanceof FormData) {
    delete headers['Content-Type'];
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  const json: ApiResponse<T> = await res.json().catch(() => ({
    success: false,
    message: 'An unexpected network error occurred.',
    code: 'NETWORK_ERROR',
  }));

  if (!json.success) {
    throw new ApiError(json.code, json.message, res.status);
  }

  return json.data;
}

export function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'GET' });
}

export function apiPost<T>(path: string, body?: any): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPut<T>(path: string, body?: any): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PUT',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiPatch<T>(path: string, body?: any): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}

export interface UserSession {
  id: string;
  type: 'platform' | 'staff' | 'customer';
  name: string;
  phone: string | null;
  email: string | null;
  shop?: { id: string; name: string; slug: string } | null;
  isOwner?: boolean;
  permissions?: Record<string, string>;
}

export function saveSession(token: string, csrfToken: string, user: UserSession) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('token', token);
    localStorage.setItem('csrfToken', csrfToken);
    localStorage.setItem('user', JSON.stringify(user));
  }
}

export function getSession(): UserSession | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem('user');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('csrfToken');
    localStorage.removeItem('user');
  }
}
