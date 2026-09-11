import { startTiming } from '@/lib/performance-timing';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Override this in .env when the API runs on a different computer.
const host = Constants.expoConfig?.hostUri?.split(':')[0];
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'web' ? 'http://localhost:3000/api' :
    `http://${host || (Platform.OS === 'android' ? '10.0.2.2' : 'localhost')}:3000/api`)).replace(/\/$/, '');

export const GENERIC_ERROR = 'Unable to complete this request. Please try again.';

// A response the backend answered with a non-2xx status. The message is the backend's own.
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Checked by name rather than instanceof so it survives class transpilation.
export function isApiError(error: unknown): error is ApiError {
  return error instanceof Error && error.name === 'ApiError' && typeof (error as ApiError).status === 'number';
}

type RequestOptions = { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: object; token?: string };

// Sends JSON to the API and returns the parsed body. Throws ApiError for HTTP failures and a
// plain Error with a safe message for timeouts and network problems.
export async function apiRequest(path: string, { method = 'GET', body, token }: RequestOptions = {}): Promise<unknown> {
  const finishTiming = startTiming(`API ${method} (including body parsing)`);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const data: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const message = (data as { message?: unknown } | null)?.message;
      throw new ApiError(typeof message === 'string' && message ? message : GENERIC_ERROR, response.status);
    }
    return data;
  } catch (error) {
    if (isApiError(error)) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new Error('The request timed out. Please try again.');
    if (error instanceof TypeError) throw new Error('Cannot reach HomeHub. Check your connection and try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
    finishTiming();
  }
}
