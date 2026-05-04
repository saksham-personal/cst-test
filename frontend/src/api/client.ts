import axios from 'axios';
import { toast } from 'sonner';

export const apiClient = axios.create({
  baseURL: (import.meta as any).env.VITE_API_BASE || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

export function extractApiErrorMessage(error: any, fallback = 'An unexpected error occurred'): string {
  const payload = error?.response?.data;
  const detail = payload?.detail;
  const appError = payload?.error;

  if (typeof detail === 'string' && detail.trim()) return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    return detail
      .map((item: any) => item?.msg || item?.message || String(item))
      .filter(Boolean)
      .join('; ');
  }
  if (typeof appError?.message === 'string' && appError.message.trim()) return appError.message;
  if (typeof appError?.details === 'string' && appError.details.trim()) return appError.details;
  if (Array.isArray(appError?.details?.errors) && appError.details.errors.length > 0) {
    return appError.details.errors
      .map((item: any) => item?.msg || item?.message || String(item))
      .filter(Boolean)
      .join('; ');
  }
  return error?.message || fallback;
}

function hasSkipErrorToastHeader(headers: any): boolean {
  if (!headers) return false;
  if (headers['X-Skip-Error-Toast'] || headers['x-skip-error-toast']) return true;
  if (typeof headers.get === 'function') {
    return Boolean(headers.get('X-Skip-Error-Toast') || headers.get('x-skip-error-toast'));
  }
  return false;
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Blob responses (downloads) need manual error parsing at the call site
    // since a JSON error body arrives as a Blob. Let the caller surface the
    // message with its own toast so we don't double-toast.
    const isBlob = error?.config?.responseType === 'blob';
    // Callers that want to handle errors inline can opt-out via header.
    const suppress = hasSkipErrorToastHeader(error?.config?.headers);
    if (!isBlob && !suppress) {
      toast.error('API Error', {
        description: extractApiErrorMessage(error),
      });
    }
    return Promise.reject(error);
  }
);
